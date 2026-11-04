// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
import {GigEscrow} from "../../src/gigs/GigEscrow.sol";
import {IGroundedReputation} from "../../src/interfaces/IGroundedReputation.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";

interface IUsdcGig {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address) external view returns (uint256);
}

contract AlwaysTrusted is IGroundedReputation {
    function meets(uint256, uint8, uint32) external pure returns (bool) {
        return true;
    }
}

/// @notice `GigEscrow.release` against the real USDC and the live ERC-8004 identity registry. The mock
///         token in the unit tests cannot prove that USDC accepts a `receiveWithAuthorization` whose
///         funds the escrow handed to the client one call earlier. Skipped without `MONAD_FORK_RPC`.
contract GigEscrowForkTest is Test {
    address internal constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    uint256 internal constant AGENT = 1;
    uint96 internal constant AMOUNT = 1e6;
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    ReceiptRegistry internal receipts;
    ReceiptRouter internal router;
    GigEscrow internal escrow;
    address internal client;
    uint256 internal clientKey;
    address internal feeTo = makeAddr("feeTo");

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_FORK_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);

        (client, clientKey) = makeAddrAndKey("gigClient");

        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        receipts = new ReceiptRegistry(predictedRouter, address(this));
        address[] memory tokens = new address[](1);
        tokens[0] = USDC;
        router = new ReceiptRouter(IIdentityRegistry(IDENTITY), receipts, tokens);
        escrow = new GigEscrow(IERC20(USDC), router, new AlwaysTrusted(), feeTo);

        deal(USDC, client, 10e6);
        vm.prank(client);
        IERC20(USDC).approve(address(escrow), type(uint256).max);
    }

    function test_hireThenRelease_againstRealUsdc() public {
        address wallet = IIdentityRegistry(IDENTITY).getAgentWallet(AGENT);
        assertTrue(wallet != address(0), "agent 1 has no wallet");
        uint256 walletBefore = IUsdcGig(USDC).balanceOf(wallet);

        vm.prank(client);
        uint256 jobId = escrow.hire(AGENT, AMOUNT, 70, 3, uint40(block.timestamp + 1 days));
        assertEq(IUsdcGig(USDC).balanceOf(address(escrow)), AMOUNT + escrow.feeOf(AMOUNT), "escrow holds amount + fee");

        bytes32 salt = keccak256("gig-release");
        uint256 validBefore = block.timestamp + 1 hours;
        bytes memory sig = _authorize(salt, validBefore);

        vm.prank(client);
        uint256 receiptId = escrow.release(jobId, 0, validBefore, salt, sig);

        assertEq(receipts.get(receiptId).payer, client, "the receipt must name the client, who can now rate");
        assertEq(IUsdcGig(USDC).balanceOf(wallet) - walletBefore, AMOUNT, "freelancer paid");
        assertEq(IUsdcGig(USDC).balanceOf(feeTo), escrow.feeOf(AMOUNT), "fee paid");
        assertEq(IUsdcGig(USDC).balanceOf(address(escrow)), 0, "escrow emptied");
        assertEq(IUsdcGig(USDC).balanceOf(address(router)), 0, "router holds nothing");
        assertEq(IUsdcGig(USDC).balanceOf(client), 10e6 - AMOUNT - escrow.feeOf(AMOUNT), "client spent amount + fee");
    }

    function _authorize(bytes32 salt, uint256 validBefore) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH,
                client,
                address(router),
                uint256(AMOUNT),
                uint256(0),
                validBefore,
                router.authorizationNonce(AGENT, salt)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IUsdcGig(USDC).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(clientKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
