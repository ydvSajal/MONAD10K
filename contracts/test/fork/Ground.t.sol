// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {GroundedReputation} from "../../src/GroundedReputation.sol";
import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
import {ReviewerRegistry} from "../../src/ReviewerRegistry.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../../src/interfaces/IReputationRegistry.sol";
import {Score, WebAuthnSig} from "../../src/types/GroundedTypes.sol";
import {WebAuthnHelper} from "../utils/WebAuthnHelper.sol";

interface IGiveFeedback {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;
}

/// @notice The whole path against the live registries: pay -> giveFeedback -> bind -> ground.
/// @dev This is the only test that proves `Erc8004Adapter` matches the deployed encoding, including
///      how feedback indices are numbered. Skipped when MONAD_FORK_RPC is unset; run with `-n monad`.
contract GroundForkTest is Test, WebAuthnHelper {
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address internal constant REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address internal constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    uint256 internal constant AGENT = 1;

    ReceiptRegistry internal receipts;
    ReceiptRouter internal router;
    ReviewerRegistry internal reviewers;
    GroundedReputation internal grd;

    bytes32 internal rp;
    address internal payer;
    uint256 internal constant PK = 0xA11CE;

    function _skipUnlessFork() internal returns (bool) {
        string memory rpc = vm.envOr("MONAD_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return true;
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 10_143, "fork is not Monad testnet");
        return false;
    }

    function _deployStack() internal {
        rp = _rpIdHash("grounded.sajal.sbs");
        reviewers = new ReviewerRegistry(rp);

        // Same CREATE-address precompute the deploy script uses: registry first, then router,
        // then GroundedReputation, so both immutables land on their real addresses.
        uint256 nonce = vm.getNonce(address(this));
        address predictedRouter = vm.computeCreateAddress(address(this), nonce + 1);
        address predictedGrounded = vm.computeCreateAddress(address(this), nonce + 2);

        receipts = new ReceiptRegistry(predictedRouter, predictedGrounded);
        address[] memory tokens = new address[](1);
        tokens[0] = USDC;
        router = new ReceiptRouter(IIdentityRegistry(IDENTITY), receipts, tokens);
        grd = new GroundedReputation(
            IIdentityRegistry(IDENTITY), IReputationRegistry(REPUTATION), receipts, router, reviewers
        );

        assertEq(address(router), predictedRouter, "router address drifted");
        assertEq(address(grd), predictedGrounded, "grounded address drifted");
    }

    /// @dev Attributes the `ground` bill: the ERC-8004 registries are UUPS proxies, so every read
    ///      is a delegatecall, and those reads are not something we can optimise away.
    function _measureReadCosts(uint64 index) internal {
        uint256 g = gasleft();
        IReputationRegistry(REPUTATION).readFeedback(AGENT, payer, index);
        emit log_named_uint("live readFeedback (warm)", g - gasleft());

        g = gasleft();
        IIdentityRegistry(IDENTITY).ownerOf(AGENT);
        IIdentityRegistry(IDENTITY).getApproved(AGENT);
        IIdentityRegistry(IDENTITY).getAgentWallet(AGENT);
        IIdentityRegistry(IDENTITY).isApprovedForAll(address(1), payer);
        emit log_named_uint("live identity exclusion reads, 4 calls (warm)", g - gasleft());

        g = gasleft();
        reviewers.keyOf(payer);
        emit log_named_uint("keyOf (warm)", g - gasleft());
    }

    function test_ground_againstLiveRegistries() public {
        if (_skipUnlessFork()) return;

        // A reviewer must not be the agent's own side, so derive one and check it is excluded.
        payer = makeAddr("forkPayer");
        address owner = IIdentityRegistry(IDENTITY).ownerOf(AGENT);
        vm.assume(payer != owner);

        _deployStack();
        deal(USDC, payer, 10e6);

        vm.startPrank(payer);
        IERC20Minimal(USDC).approve(address(router), type(uint256).max);
        uint256 receiptId = router.pay(AGENT, USDC, 0.5e6);

        // The reviewer writes their own ERC-8004 feedback; Grounded never does it for them.
        IGiveFeedback(REPUTATION).giveFeedback(AGENT, int128(80), 0, "quality", "", "", "", bytes32(0));
        vm.stopPrank();

        uint64 index = IReputationRegistry(REPUTATION).getLastIndex(AGENT, payer);
        emit log_named_uint("feedback index assigned by the live registry", index);

        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK);
        vm.startPrank(payer);
        reviewers.bind(qx, qy, _webauthnSig(PK, rp, FLAGS_UP_UV, reviewers.bindDigest(payer, qx, qy, 0)));

        uint40 deadline = uint40(block.timestamp + 1 hours);
        bytes32 digest = grd.groundDigest(receiptId, AGENT, index, 80, false, payer, deadline);
        WebAuthnSig memory sig = _webauthnSig(PK, rp, FLAGS_UP_UV, digest);

        uint256 g = gasleft();
        grd.ground(receiptId, index, deadline, sig);
        emit log_named_uint("ground gas (live precompile + live registries)", g - gasleft());
        vm.stopPrank();

        Score memory s = grd.scoreOf(AGENT);
        assertEq(s.median, 80, "median from the live feedback");
        assertEq(s.reviewers, 1);

        _measureReadCosts(index);

        // And the revocation path, against the registry's own revoke.
        vm.prank(payer);
        IGiveFeedback(REPUTATION).revokeFeedback(AGENT, index);
        grd.sweepRevoked(AGENT, payer);
        assertEq(grd.scoreOf(AGENT).reviewers, 0, "revoked rating swept out");
    }
}

interface IERC20Minimal {
    function approve(address spender, uint256 value) external returns (bool);
}
