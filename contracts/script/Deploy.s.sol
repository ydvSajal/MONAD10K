// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {GroundedReputation} from "../src/GroundedReputation.sol";
import {ReceiptRegistry} from "../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../src/ReceiptRouter.sol";
import {ReviewerRegistry} from "../src/ReviewerRegistry.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";

/// @notice Deploys the four contracts in one broadcast.
/// @dev `ReceiptRegistry` takes the router and reputation addresses as immutables, and the router
///      takes the registry — a cycle. It is resolved by predicting the CREATE addresses from the
///      deployer's nonce, which only holds if all four land in this one run, in this order, with
///      nothing else sent from that account in between. The script asserts each prediction.
///
///      Run:
///        forge script script/Deploy.s.sol --rpc-url $NEXT_PUBLIC_RPC_URL \
///          --account grounded-deployer --broadcast --verify
///
///      Addresses live in state rather than locals because `run()` otherwise runs out of stack.
contract Deploy is Script {
    /// @dev ERC-8004 on Monad testnet (selector-verified against deployed bytecode, 18 Sep).
    address constant IDENTITY_10143 = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_10143 = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant USDC_10143 = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    address identity;
    address reputation;
    address usdc;
    string rpId;

    address reviewers;
    address receipts;
    address router;
    address grounded;

    function run() external {
        identity = vm.envOr("ERC8004_IDENTITY", IDENTITY_10143);
        reputation = vm.envOr("ERC8004_REPUTATION", REPUTATION_10143);
        usdc = vm.envOr("USDC", USDC_10143);
        rpId = vm.envOr("RP_ID", string("grounded.sajal.sbs"));

        _deploy();
        _report();
        _write();
    }

    function _deploy() private {
        uint256 nonce = vm.getNonce(msg.sender);
        address predictedRouter = vm.computeCreateAddress(msg.sender, nonce + 2);
        address predictedGrounded = vm.computeCreateAddress(msg.sender, nonce + 3);

        address[] memory tokens = new address[](1);
        tokens[0] = usdc;

        vm.startBroadcast();
        reviewers = address(new ReviewerRegistry(sha256(bytes(rpId)))); // nonce + 0
        receipts = address(new ReceiptRegistry(predictedRouter, predictedGrounded)); // nonce + 1
        router = address(new ReceiptRouter(IIdentityRegistry(identity), ReceiptRegistry(receipts), tokens)); // +2
        grounded = address(
            new GroundedReputation( // nonce + 3
                IIdentityRegistry(identity),
                IReputationRegistry(reputation),
                ReceiptRegistry(receipts),
                ReceiptRouter(router),
                ReviewerRegistry(reviewers)
            )
        );
        vm.stopBroadcast();

        // If either trips, the receipt registry points at nothing and the deployment is scrap.
        // Fail loudly rather than write a broken addresses file.
        require(router == predictedRouter, "router address prediction drifted");
        require(grounded == predictedGrounded, "grounded address prediction drifted");
    }

    function _report() private view {
        console.log("chainId            ", block.chainid);
        console.log("rpId               ", rpId);
        console.log("ReviewerRegistry   ", reviewers);
        console.log("ReceiptRegistry    ", receipts);
        console.log("ReceiptRouter      ", router);
        console.log("GroundedReputation ", grounded);
    }

    function _write() private {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployedAtBlock", block.number);
        vm.serializeString(o, "rpId", rpId);
        vm.serializeAddress(o, "reviewerRegistry", reviewers);
        vm.serializeAddress(o, "receiptRegistry", receipts);
        vm.serializeAddress(o, "receiptRouter", router);
        vm.serializeAddress(o, "groundedReputation", grounded);
        vm.serializeAddress(o, "erc8004Identity", identity);
        vm.serializeAddress(o, "erc8004Reputation", reputation);
        string memory json = vm.serializeAddress(o, "usdc", usdc);

        string memory path = string.concat("../deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("wrote", path);
    }
}
