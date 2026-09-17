// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "../Base.t.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";

contract ReceiptRouterFuzzTest is Base {
    /// @dev Any accepted payment is at or above the floor, lands entirely on the agent wallet,
    ///      and leaves the router empty.
    function testFuzz_payNeverKeepsFundsOrBreaksFloor(uint96 value) public {
        value = uint96(bound(value, 1, 1000e6));
        usdc.mint(payer, value);
        uint256 walletBefore = usdc.balanceOf(agentWallet);

        vm.prank(payer);
        try router.pay(AGENT, address(usdc), value) returns (uint256 id) {
            assertGe(value, router.MIN_AMOUNT_6DP(), "accepted below the floor");
            assertEq(usdc.balanceOf(agentWallet) - walletBefore, value, "underpaid the agent");
            assertEq(usdc.balanceOf(address(router)), 0, "router kept funds");
            assertEq(receipts.get(id).amount, value);
        } catch {
            assertLt(value, router.MIN_AMOUNT_6DP(), "rejected a valid amount");
        }
    }
}
