// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {ReceiptRouter} from "../src/ReceiptRouter.sol";
import {GigEscrow} from "../src/gigs/GigEscrow.sol";
import {IGroundedReputation} from "../src/interfaces/IGroundedReputation.sol";

/// @notice Deploys `GigEscrow` against the Grounded deployment in `deployments/<chainId>.json`.
///         The deployer receives the fee, and has no other role.
///
///      Run:
///        forge script script/DeployGigs.s.sol --rpc-url $NEXT_PUBLIC_RPC_URL \
///          --account grounded-deployer --sender <deployer> --broadcast
contract DeployGigs is Script {
    using stdJson for string;

    function run() external {
        string memory json = vm.readFile(string.concat("../deployments/", vm.toString(block.chainid), ".json"));

        vm.startBroadcast();
        GigEscrow escrow = new GigEscrow(
            IERC20(json.readAddress(".usdc")),
            ReceiptRouter(json.readAddress(".receiptRouter")),
            IGroundedReputation(json.readAddress(".groundedReputation")),
            msg.sender
        );
        vm.stopBroadcast();

        console.log("GigEscrow", address(escrow));
    }
}
