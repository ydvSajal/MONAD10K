// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "../Base.t.sol";
import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {Receipt as GroundedReceipt, ReceiptStatus} from "../../src/types/GroundedTypes.sol";

contract ReceiptRegistryTest is Base {
    function _pay(uint256 amount) internal returns (uint256 id) {
        vm.prank(payer);
        id = router.pay(AGENT, address(usdc), amount);
    }

    function test_idsAreSequentialFromOne() public {
        assertEq(_pay(1e6), 1);
        assertEq(_pay(1e6), 2);
        assertEq(_pay(1e6), 3);
    }

    function test_issue_onlyRouter() public {
        GroundedReceipt memory r = GroundedReceipt({
            agentId: AGENT,
            payer: payer,
            token: address(usdc),
            amount: 1e6,
            paidAt: uint40(block.timestamp),
            status: ReceiptStatus.Issued
        });
        vm.expectRevert(ReceiptRegistry.NotRouter.selector);
        receipts.issue(r);
    }

    function test_consume_onlyGrounded() public {
        uint256 id = _pay(1e6);
        vm.expectRevert(ReceiptRegistry.NotGrounded.selector);
        receipts.consume(id);
    }

    function test_consume_marksConsumedOnce() public {
        uint256 id = _pay(1e6);

        vm.prank(grounded);
        receipts.consume(id);
        assertEq(uint8(receipts.get(id).status), uint8(ReceiptStatus.Consumed));
        assertFalse(receipts.isValid(id));

        vm.prank(grounded);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.ReceiptNotIssued.selector, id));
        receipts.consume(id);
    }

    function test_consume_revertsAfterTtl() public {
        uint256 id = _pay(1e6);
        vm.warp(block.timestamp + receipts.RECEIPT_TTL() + 1);

        assertFalse(receipts.isValid(id));
        vm.prank(grounded);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.ReceiptExpired.selector, id));
        receipts.consume(id);
    }

    function test_consume_allowedOnTtlBoundary() public {
        uint256 id = _pay(1e6);
        vm.warp(block.timestamp + receipts.RECEIPT_TTL());

        vm.prank(grounded);
        receipts.consume(id);
        assertEq(uint8(receipts.get(id).status), uint8(ReceiptStatus.Consumed));
    }

    function test_consume_revertsOnUnknownId() public {
        vm.prank(grounded);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.ReceiptNotIssued.selector, 42));
        receipts.consume(42);
    }
}
