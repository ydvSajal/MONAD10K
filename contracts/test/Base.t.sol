// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ReceiptRegistry} from "../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../src/ReceiptRouter.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {MockERC20, MockERC3009, MockIdentityRegistry} from "./mocks/Mocks.sol";

/// @dev Deploys the registry/router pair the way the real script must: the registry's
///      immutable `router` is a precomputed CREATE address, so no setter is ever needed.
abstract contract Base is Test {
    uint256 internal constant AGENT = 1;

    MockIdentityRegistry internal identity;
    MockERC20 internal usdc; // 6 decimals
    MockERC3009 internal usdc3009; // 6 decimals, EIP-3009
    ReceiptRegistry internal receipts;
    ReceiptRouter internal router;

    address internal grounded = makeAddr("grounded");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentWallet = makeAddr("agentWallet");
    address internal payer = makeAddr("payer");

    function setUp() public virtual {
        identity = new MockIdentityRegistry();
        identity.setAgent(AGENT, agentOwner, agentWallet);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc3009 = new MockERC3009(6);

        // registry is deployed first, so the router lands at the next CREATE address
        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        receipts = new ReceiptRegistry(predictedRouter, grounded);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(usdc3009);
        router = new ReceiptRouter(IIdentityRegistry(address(identity)), receipts, tokens);
        assertEq(address(router), predictedRouter, "CREATE address prediction drifted");

        usdc.mint(payer, 1000e6);
        usdc3009.mint(payer, 1000e6);
        vm.prank(payer);
        usdc.approve(address(router), type(uint256).max);
    }
}
