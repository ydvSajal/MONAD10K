// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
import {IERC3009} from "../../src/interfaces/IERC3009.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";

interface IUsdc {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address) external view returns (uint256);
    function authorizationState(address, bytes32) external view returns (bool);
}

/// @notice Runs against live Monad testnet. Skipped when MONAD_FORK_RPC is unset, so CI
///         stays offline by default: `MONAD_FORK_RPC=https://testnet-rpc.monad.xyz forge test`.
contract Usdc3009ForkTest is Test {
    address internal constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    uint256 internal constant AGENT = 1;

    uint256 internal constant VALUE = 0.05e6;
    bytes32 internal constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    ReceiptRegistry internal receipts;
    ReceiptRouter internal router;
    address internal payer;
    uint256 internal payerKey;

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_FORK_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);

        (payer, payerKey) = makeAddrAndKey("forkPayer");

        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        receipts = new ReceiptRegistry(predictedRouter, address(this));
        address[] memory tokens = new address[](1);
        tokens[0] = USDC;
        router = new ReceiptRouter(IIdentityRegistry(IDENTITY), receipts, tokens);

        deal(USDC, payer, 10e6);
    }

    /// @dev The whole EIP-3009 path hinges on this string. Circle uses "USD Coin" on some
    ///      chains; Monad testnet uses "USDC". A silent change here breaks every payment.
    function test_domainNameIsExactlyUSDC() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("USDC")),
                keccak256(bytes("2")),
                block.chainid,
                USDC
            )
        );
        assertEq(IUsdc(USDC).DOMAIN_SEPARATOR(), expected, "USDC EIP-712 domain drifted");
    }

    function test_payWithAuthorization_againstRealUsdc() public {
        address to = IIdentityRegistry(IDENTITY).getAgentWallet(AGENT);
        assertTrue(to != address(0), "agent 1 has no wallet");
        bytes32 salt = keccak256("grounded-fork-test");
        (uint256 validBefore, bytes memory sig) = _authorize(AGENT, salt);

        uint256 toBefore = IUsdc(USDC).balanceOf(to);
        uint256 id = router.payWithAuthorization(AGENT, USDC, payer, VALUE, 0, validBefore, salt, sig);

        assertEq(id, 1);
        assertEq(IUsdc(USDC).balanceOf(to) - toBefore, VALUE, "agent wallet not paid");
        assertEq(IUsdc(USDC).balanceOf(address(router)), 0, "router kept funds");
        assertTrue(IUsdc(USDC).authorizationState(payer, router.authorizationNonce(AGENT, salt)), "not burned");
        assertEq(receipts.get(id).payer, payer);
    }

    /// @dev The front-run the receive path exists to stop: redeeming the signed authorization
    ///      straight at the token would move the money with no receipt. USDC refuses anyone but the payee.
    function test_authorizationCannotBeRedeemedOutsideTheRouter() public {
        bytes32 salt = keccak256("front-run");
        (uint256 validBefore, bytes memory sig) = _authorize(AGENT, salt);
        (bytes32 r, bytes32 s, uint8 v) = _split(sig);
        bytes32 nonce = router.authorizationNonce(AGENT, salt); // before the prank: it is a call too

        vm.prank(makeAddr("frontRunner"));
        vm.expectRevert();
        IERC3009(USDC).receiveWithAuthorization(payer, address(router), VALUE, 0, validBefore, nonce, v, r, s);

        // The router, the named payee, can still redeem it.
        router.payWithAuthorization(AGENT, USDC, payer, VALUE, 0, validBefore, salt, sig);
    }

    /// @dev A relayer cannot take an authorization signed to pay one agent and spend it on another.
    function test_authorizationCannotBeRelayedToAnotherAgent() public {
        uint256 other = AGENT + 1;
        assertTrue(IIdentityRegistry(IDENTITY).getAgentWallet(other) != address(0), "agent 2 has no wallet");
        bytes32 salt = keccak256("redirect");
        (uint256 validBefore, bytes memory sig) = _authorize(AGENT, salt);

        vm.expectRevert();
        router.payWithAuthorization(other, USDC, payer, VALUE, 0, validBefore, salt, sig);
    }

    function _authorize(uint256 agentId, bytes32 salt) internal view returns (uint256 validBefore, bytes memory) {
        validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
                payer,
                address(router),
                VALUE,
                uint256(0),
                validBefore,
                router.authorizationNonce(agentId, salt)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IUsdc(USDC).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return (validBefore, abi.encodePacked(r, s, v));
    }

    function _split(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
