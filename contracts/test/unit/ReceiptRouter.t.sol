// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "../Base.t.sol";
import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {Receipt as GroundedReceipt, ReceiptStatus} from "../../src/types/GroundedTypes.sol";
import {MockERC20} from "../mocks/Mocks.sol";

contract ReceiptRouterTest is Base {
    function test_pay_transfersToAgentWalletAndIssuesReceipt() public {
        vm.expectEmit(true, true, true, true, address(receipts));
        emit ReceiptRegistry.ReceiptIssued(1, AGENT, payer, address(usdc), 0.05e6);

        vm.prank(payer);
        uint256 id = router.pay(AGENT, address(usdc), 0.05e6);

        assertEq(id, 1);
        assertEq(usdc.balanceOf(agentWallet), 0.05e6, "agent wallet paid");
        assertEq(usdc.balanceOf(address(router)), 0, "router holds nothing");

        GroundedReceipt memory r = receipts.get(id);
        assertEq(r.agentId, AGENT);
        assertEq(r.payer, payer);
        assertEq(r.token, address(usdc));
        assertEq(r.amount, 0.05e6);
        assertEq(uint8(r.status), uint8(ReceiptStatus.Issued));
        assertTrue(receipts.isValid(id));
    }

    function test_pay_revertsBelowDustFloor() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.AmountBelowMinimum.selector, 9999));
        router.pay(AGENT, address(usdc), 9999); // 0.009999 USDC
    }

    function test_pay_revertsOnUnknownToken() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        other.mint(payer, 100e6);
        vm.startPrank(payer);
        other.approve(address(router), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.TokenNotAllowed.selector, address(other)));
        router.pay(AGENT, address(other), 1e6);
        vm.stopPrank();
    }

    function test_pay_revertsWhenAgentHasNoWallet() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.NoAgentWallet.selector, 999));
        router.pay(999, address(usdc), 1e6);
    }

    function test_pay_revertsWhenAgentWalletIsRouter() public {
        identity.setAgent(2, agentOwner, address(router));
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.InvalidRecipient.selector, address(router)));
        router.pay(2, address(usdc), 1e6);
    }

    function test_pay_revertsAboveUint96() public {
        uint256 tooBig = uint256(type(uint96).max) + 1;
        usdc.mint(payer, tooBig);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.AmountTooLarge.selector, tooBig));
        router.pay(AGENT, address(usdc), tooBig);
    }

    function test_constructor_revertsWithNoTokens() public {
        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        ReceiptRegistry reg = new ReceiptRegistry(predictedRouter, grounded);
        vm.expectRevert(ReceiptRouter.NoTokens.selector);
        new ReceiptRouter(IIdentityRegistry(address(identity)), reg, new address[](0));
    }

    /// @dev The floor is 0.01 *normalised*, not 10_000 raw units — an 18-decimal token must
    ///      not let dust through.
    function test_pay_normalisesDecimals() public {
        MockERC20 dai = new MockERC20("Dai", "DAI", 18);
        dai.mint(payer, 100e18);

        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        ReceiptRegistry reg = new ReceiptRegistry(predictedRouter, grounded);
        address[] memory tokens = new address[](1);
        tokens[0] = address(dai);
        ReceiptRouter r18 = new ReceiptRouter(IIdentityRegistry(address(identity)), reg, tokens);

        vm.startPrank(payer);
        dai.approve(address(r18), type(uint256).max);

        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.AmountBelowMinimum.selector, 9999));
        r18.pay(AGENT, address(dai), 0.009999e18);

        uint256 id = r18.pay(AGENT, address(dai), 0.01e18);
        vm.stopPrank();
        assertEq(id, 1);
        assertEq(reg.get(id).amount, 0.01e18);
    }

    function test_payWithAuthorization_payerIsSignerNotRelayer() public {
        address relayer = makeAddr("relayer");
        bytes memory sig = new bytes(65);

        vm.prank(relayer);
        uint256 id = router.payWithAuthorization(
            AGENT, address(usdc3009), payer, 0.05e6, block.timestamp - 1, block.timestamp + 1 hours, bytes32("n1"), sig
        );

        assertEq(receipts.get(id).payer, payer, "receipt credits the signer");
        assertEq(usdc3009.balanceOf(agentWallet), 0.05e6);
    }

    function test_payWithAuthorization_revertsOnBadSignatureLength() public {
        vm.expectRevert(abi.encodeWithSelector(ReceiptRouter.BadSignatureLength.selector, 64));
        router.payWithAuthorization(
            AGENT,
            address(usdc3009),
            payer,
            0.05e6,
            block.timestamp - 1,
            block.timestamp + 1 hours,
            bytes32("n2"),
            new bytes(64)
        );
    }
}
