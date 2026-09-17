// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {ReceiptStatus} from "../../src/types/GroundedTypes.sol";
import {MockERC20, MockIdentityRegistry} from "../mocks/Mocks.sol";

/// @dev Drives random pay/consume traffic. Consume is routed through the registry's
///      `grounded` address so the handler can exercise the real access control.
contract Handler is Test {
    ReceiptRouter public router;
    ReceiptRegistry public receipts;
    MockERC20 public token;
    address public grounded;
    uint256 public consumedCount;

    constructor(ReceiptRouter router_, ReceiptRegistry receipts_, MockERC20 token_, address grounded_) {
        router = router_;
        receipts = receipts_;
        token = token_;
        grounded = grounded_;
    }

    function pay(uint256 actorSeed, uint96 value) external {
        address actor = address(uint160(uint256(keccak256(abi.encode(actorSeed)))));
        // A payer must be an outside account: minting to the router or registry and then
        // reverting below the floor would strand tokens there and fail the balance invariant
        // for a reason the contract is not responsible for.
        if (actor == address(router) || actor == address(receipts) || actor == address(token) || actor.code.length > 0)
        {
            return;
        }
        value = uint96(bound(value, 0, 100e6));
        token.mint(actor, value);
        vm.startPrank(actor);
        token.approve(address(router), value);
        try router.pay(1, address(token), value) {} catch {}
        vm.stopPrank();
    }

    function consume(uint256 idSeed) external {
        uint256 id = bound(idSeed, 1, receipts.nextId());
        vm.prank(grounded);
        try receipts.consume(id) {
            consumedCount++;
        } catch {}
    }
}

contract RouterInvariantTest is Test {
    ReceiptRegistry internal receipts;
    ReceiptRouter internal router;
    MockERC20 internal token;
    Handler internal handler;
    address internal grounded = makeAddr("grounded");

    function setUp() public {
        MockIdentityRegistry identity = new MockIdentityRegistry();
        identity.setAgent(1, makeAddr("owner"), makeAddr("wallet"));
        token = new MockERC20("USD Coin", "USDC", 6);

        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        receipts = new ReceiptRegistry(predictedRouter, grounded);
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        router = new ReceiptRouter(IIdentityRegistry(address(identity)), receipts, tokens);

        handler = new Handler(router, receipts, token, grounded);
        targetContract(address(handler));
    }

    /// @notice The router is a pipe, never a purse.
    function invariant_routerHoldsNothing() public view {
        assertEq(token.balanceOf(address(router)), 0);
    }

    /// @notice Every id below the counter is issued or consumed, never re-openable.
    function invariant_receiptsAreConsumedAtMostOnce() public view {
        uint256 consumed;
        for (uint256 id = 1; id < receipts.nextId(); ++id) {
            ReceiptStatus s = receipts.get(id).status;
            assertTrue(s == ReceiptStatus.Issued || s == ReceiptStatus.Consumed);
            if (s == ReceiptStatus.Consumed) consumed++;
        }
        assertEq(consumed, handler.consumedCount(), "consume() double-counted an id");
    }
}
