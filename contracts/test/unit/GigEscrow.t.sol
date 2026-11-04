// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {GigEscrow} from "../../src/gigs/GigEscrow.sol";
import {IGroundedReputation} from "../../src/interfaces/IGroundedReputation.sol";
import {Base} from "../Base.t.sol";

contract MockGrounded is IGroundedReputation {
    bool public ok = true;

    function set(bool ok_) external {
        ok = ok_;
    }

    function meets(uint256, uint8, uint32) external view returns (bool) {
        return ok;
    }
}

contract GigEscrowTest is Base {
    uint96 internal constant AMOUNT = 1e6;
    uint96 internal constant FEE = 0.05e6;

    GigEscrow internal escrow;
    MockGrounded internal gate;
    address internal feeTo = makeAddr("feeTo");
    uint40 internal deadline;

    function setUp() public override {
        super.setUp();
        gate = new MockGrounded();
        escrow = new GigEscrow(IERC20(address(usdc3009)), router, gate, feeTo);
        deadline = uint40(block.timestamp + 1 days);
        vm.prank(payer);
        usdc3009.approve(address(escrow), type(uint256).max);
    }

    function _hire() private returns (uint256) {
        vm.prank(payer);
        return escrow.hire(AGENT, AMOUNT, 70, 3, deadline);
    }

    function _release(uint256 jobId, address caller) private returns (uint256) {
        vm.prank(caller);
        return escrow.release(jobId, 0, block.timestamp + 1 hours, bytes32("salt"), new bytes(65));
    }

    function test_hire_locksAmountAndFee() public {
        uint256 before = usdc3009.balanceOf(payer);
        uint256 id = _hire();
        assertEq(id, 1);
        assertEq(usdc3009.balanceOf(address(escrow)), AMOUNT + FEE);
        assertEq(usdc3009.balanceOf(payer), before - AMOUNT - FEE);
    }

    function test_hire_refusesUntrustedAgentAndMovesNothing() public {
        gate.set(false);
        uint256 before = usdc3009.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.AgentNotTrusted.selector, AGENT));
        escrow.hire(AGENT, AMOUNT, 70, 3, deadline);
        assertEq(usdc3009.balanceOf(payer), before);
        assertEq(escrow.jobCount(), 0);
    }

    function test_hire_refusesAgentNobodyCanPay() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.NoAgentWallet.selector, 999));
        escrow.hire(999, AMOUNT, 70, 3, deadline);
    }

    function test_hire_refusesDustAndPastDeadline() public {
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.AmountBelowMinimum.selector, uint96(9999)));
        escrow.hire(AGENT, 9999, 70, 3, deadline);
        uint40 past = uint40(block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.BadDeadline.selector, past));
        escrow.hire(AGENT, AMOUNT, 70, 3, past);
        vm.stopPrank();
    }

    /// @dev The point of the release design: the rating right belongs to the client, not the escrow.
    function test_release_paysFreelancerAndReceiptNamesClient() public {
        uint256 id = _hire();
        uint256 clientBefore = usdc3009.balanceOf(payer);
        uint256 receiptId = _release(id, payer);

        assertEq(receipts.get(receiptId).payer, payer, "client is the receipt payer");
        assertEq(receipts.get(receiptId).agentId, AGENT);
        assertEq(usdc3009.balanceOf(agentWallet), AMOUNT);
        assertEq(usdc3009.balanceOf(feeTo), FEE);
        assertEq(usdc3009.balanceOf(payer), clientBefore, "client keeps nothing extra");
        assertEq(usdc3009.balanceOf(address(escrow)), 0);
    }

    function test_release_onlyClientOnlyOnce() public {
        uint256 id = _hire();
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.NotClient.selector, stranger));
        escrow.release(id, 0, block.timestamp + 1 hours, bytes32("salt"), new bytes(65));

        _release(id, payer);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.BadStatus.selector, GigEscrow.Status.Released));
        escrow.release(id, 0, block.timestamp + 1 hours, bytes32("salt2"), new bytes(65));
    }

    /// @dev A bad signature must not leave the client holding the handed-back amount.
    function test_release_failedPullRevertsEverything() public {
        uint256 id = _hire();
        uint256 clientBefore = usdc3009.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert();
        escrow.release(id, 0, block.timestamp + 1 hours, bytes32("salt"), new bytes(64));
        assertEq(usdc3009.balanceOf(payer), clientBefore);
        assertEq(usdc3009.balanceOf(address(escrow)), AMOUNT + FEE);
    }

    function test_refund_onlyAfterDeadlineThenFullAmount() public {
        uint256 before = usdc3009.balanceOf(payer);
        uint256 id = _hire();
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.TooEarly.selector, deadline));
        escrow.refund(id);

        vm.warp(deadline + 1);
        vm.prank(payer);
        escrow.refund(id);
        assertEq(usdc3009.balanceOf(payer), before);
        assertEq(usdc3009.balanceOf(address(escrow)), 0);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GigEscrow.BadStatus.selector, GigEscrow.Status.Refunded));
        escrow.refund(id);
    }
}
