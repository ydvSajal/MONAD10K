// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
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

    bytes32 internal constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
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

        uint256 value = 0.05e6;
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("grounded-fork-test");

        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, payer, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IUsdc(USDC).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);

        uint256 toBefore = IUsdc(USDC).balanceOf(to);
        uint256 id = router.payWithAuthorization(
            AGENT, USDC, payer, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v)
        );

        assertEq(id, 1);
        assertEq(IUsdc(USDC).balanceOf(to) - toBefore, value, "agent wallet not paid");
        assertEq(IUsdc(USDC).balanceOf(address(router)), 0, "router kept funds");
        assertTrue(IUsdc(USDC).authorizationState(payer, nonce), "authorization not burned");
        assertEq(receipts.get(id).payer, payer);
    }
}
