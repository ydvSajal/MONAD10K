// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "../Base.t.sol";
import {GroundedReputation} from "../../src/GroundedReputation.sol";
import {ReceiptRegistry} from "../../src/ReceiptRegistry.sol";
import {ReceiptRouter} from "../../src/ReceiptRouter.sol";
import {ReviewerRegistry} from "../../src/ReviewerRegistry.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../../src/interfaces/IReputationRegistry.sol";
import {Score, WebAuthnSig} from "../../src/types/GroundedTypes.sol";
import {MockReputationRegistry} from "../mocks/Mocks.sol";
import {WebAuthnHelper} from "../utils/WebAuthnHelper.sol";

/// @dev Full path: pay -> giveFeedback -> bind -> ground -> scoreOf.
contract GroundedReputationTest is Base, WebAuthnHelper {
    MockReputationRegistry internal reputation;
    ReviewerRegistry internal reviewers;
    GroundedReputation internal grd;

    bytes32 internal rp;
    uint40 internal deadline;

    uint256 internal constant PK_PAYER = 0xA11CE;
    uint64 internal constant IDX = 1;

    function setUp() public override {
        super.setUp();

        rp = _rpIdHash("grounded.sajal.sbs");
        reputation = new MockReputationRegistry();
        reviewers = new ReviewerRegistry(rp);

        // the registry's `grounded` immutable was fixed in Base; deploy ours at that address
        GroundedReputation deployed = new GroundedReputation(
            IIdentityRegistry(address(identity)), IReputationRegistry(address(reputation)), receipts, router, reviewers
        );
        vm.etch(grounded, address(deployed).code);
        grd = GroundedReputation(grounded);
        // immutables live in code, so the etched copy keeps them

        deadline = uint40(block.timestamp + 1 hours);
        _bind(payer, PK_PAYER);
    }

    function _bind(address who, uint256 pk) internal {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(pk);
        bytes32 digest = reviewers.bindDigest(who, qx, qy, reviewers.nonces(who));
        WebAuthnSig memory proof = _webauthnSig(pk, rp, FLAGS_UP_UV, digest);
        vm.prank(who);
        reviewers.bind(qx, qy, proof);
    }

    function _payAndRate(address who, uint256 amount, uint8 score, string memory tag)
        internal
        returns (uint256 receiptId)
    {
        vm.prank(who);
        receiptId = router.pay(AGENT, address(usdc), amount);
        reputation.setFeedback(AGENT, who, IDX, int128(uint128(score)), 0, tag);
    }

    function _groundIt(address who, uint256 pk, uint256 receiptId, uint8 score, bool isDispute) internal {
        bytes32 digest = grd.groundDigest(receiptId, AGENT, IDX, score, isDispute, who, deadline);
        WebAuthnSig memory sig = _webauthnSig(pk, rp, FLAGS_UP_UV, digest);
        vm.prank(who);
        grd.ground(receiptId, IDX, deadline, sig);
    }

    function test_ground_endToEnd() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");

        vm.expectEmit(true, true, true, true, address(grd));
        emit GroundedReputation.Grounded(AGENT, payer, id, IDX, 80, 3, false);
        _groundIt(payer, PK_PAYER, id, 80, false);

        Score memory s = grd.scoreOf(AGENT);
        assertEq(s.median, 80, "median");
        assertEq(s.reviewers, 1);
        assertEq(s.receipts, 1);
        assertEq(s.paid, 0.5e6);
        assertEq(s.weightMass, 3, "0.50 USDC weighs 3");
        assertFalse(receipts.isValid(id), "receipt consumed");
    }

    function test_ground_replacesOwnLiveRating() public {
        uint256 first = _payAndRate(payer, 0.5e6, 80, "quality");
        _groundIt(payer, PK_PAYER, first, 80, false);

        vm.prank(payer);
        uint256 second = router.pay(AGENT, address(usdc), 0.5e6);
        reputation.setFeedback(AGENT, payer, IDX, int128(20), 0, "quality");
        _groundIt(payer, PK_PAYER, second, 20, false);

        Score memory s = grd.scoreOf(AGENT);
        assertEq(s.reviewers, 1, "still one reviewer");
        assertEq(s.median, 20, "new rating replaced the old one");
        assertEq(s.weightMass, 3, "mass not doubled");
        assertEq(s.receipts, 2, "both receipts counted");
    }

    function test_ground_revertsWhenExpired() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, payer, deadline);
        WebAuthnSig memory sig = _webauthnSig(PK_PAYER, rp, FLAGS_UP_UV, digest);
        vm.warp(deadline + 1);
        vm.prank(payer);
        vm.expectRevert(GroundedReputation.Expired.selector);
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsForNonPayer() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        address stranger = makeAddr("stranger");
        _bind(stranger, 0xB0B);
        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, stranger, deadline);
        WebAuthnSig memory sig = _webauthnSig(0xB0B, rp, FLAGS_UP_UV, digest);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(GroundedReputation.NotPayer.selector, payer));
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsForAgentOwner() public {
        usdc.mint(agentOwner, 10e6);
        vm.startPrank(agentOwner);
        usdc.approve(address(router), type(uint256).max);
        uint256 id = router.pay(AGENT, address(usdc), 0.5e6);
        vm.stopPrank();
        reputation.setFeedback(AGENT, agentOwner, IDX, int128(100), 0, "quality");
        _bind(agentOwner, 0xC0FFEE);

        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 100, false, agentOwner, deadline);
        WebAuthnSig memory sig = _webauthnSig(0xC0FFEE, rp, FLAGS_UP_UV, digest);
        vm.prank(agentOwner);
        vm.expectRevert(GroundedReputation.ExcludedReviewer.selector);
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsWhenFeedbackHasDecimals() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        reputation.setFeedback(AGENT, payer, IDX, int128(800), 1, "quality"); // 80.0 with 1 decimal
        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, payer, deadline);
        WebAuthnSig memory sig = _webauthnSig(PK_PAYER, rp, FLAGS_UP_UV, digest);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GroundedReputation.BadFeedback.selector, IDX));
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsOnWrongTag() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "speed");
        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, payer, deadline);
        WebAuthnSig memory sig = _webauthnSig(PK_PAYER, rp, FLAGS_UP_UV, digest);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GroundedReputation.BadFeedback.selector, IDX));
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsWhenFeedbackRevokedBeforeGrounding() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        reputation.revokeFeedback(AGENT, payer, IDX);
        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, payer, deadline);
        WebAuthnSig memory sig = _webauthnSig(PK_PAYER, rp, FLAGS_UP_UV, digest);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GroundedReputation.BadFeedback.selector, IDX));
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsWithoutPasskey() public {
        address fresh = makeAddr("fresh");
        usdc.mint(fresh, 10e6);
        vm.startPrank(fresh);
        usdc.approve(address(router), type(uint256).max);
        uint256 id = router.pay(AGENT, address(usdc), 0.5e6);
        vm.stopPrank();
        reputation.setFeedback(AGENT, fresh, IDX, int128(80), 0, "quality");

        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, fresh, deadline);
        WebAuthnSig memory sig = _webauthnSig(0xD00D, rp, FLAGS_UP_UV, digest);
        vm.prank(fresh);
        vm.expectRevert(GroundedReputation.NoPasskey.selector);
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsWhenSignatureCoversDifferentScore() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 90, false, payer, deadline); // signed 90, feedback says 80
        WebAuthnSig memory sig = _webauthnSig(PK_PAYER, rp, FLAGS_UP_UV, digest);
        vm.prank(payer);
        vm.expectRevert(GroundedReputation.BadSignature.selector);
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_revertsOnSecondUseOfSameReceipt() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        _groundIt(payer, PK_PAYER, id, 80, false);

        bytes32 digest = grd.groundDigest(id, AGENT, IDX, 80, false, payer, deadline);
        WebAuthnSig memory sig = _webauthnSig(PK_PAYER, rp, FLAGS_UP_UV, digest);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GroundedReputation.BadReceipt.selector, id));
        grd.ground(id, IDX, deadline, sig);
    }

    function test_ground_disputeCountsSeparatelyAndDoesNotScore() public {
        uint256 id = _payAndRate(payer, 0.5e6, 0, "dispute");
        _groundIt(payer, PK_PAYER, id, 0, true);

        Score memory s = grd.scoreOf(AGENT);
        assertEq(grd.disputeCount(AGENT), 1);
        assertEq(s.reviewers, 0, "a dispute is not a score");
        assertEq(s.weightMass, 0);
        assertEq(s.receipts, 1, "the receipt still counts as paid");
    }

    function test_sweepRevoked_removesRatingFromHistogram() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        _groundIt(payer, PK_PAYER, id, 80, false);
        reputation.revokeFeedback(AGENT, payer, IDX);

        vm.expectEmit(true, true, false, true, address(grd));
        emit GroundedReputation.Swept(AGENT, payer, IDX);
        grd.sweepRevoked(AGENT, payer); // permissionless: any caller

        Score memory s = grd.scoreOf(AGENT);
        assertEq(s.reviewers, 0);
        assertEq(s.weightMass, 0);
        assertEq(s.median, 0);
        (,,,, bool exists) = grd.liveRating(AGENT, payer);
        assertFalse(exists);
    }

    function test_sweepRevoked_revertsWhileFeedbackStillValid() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        _groundIt(payer, PK_PAYER, id, 80, false);
        vm.expectRevert(GroundedReputation.StillValid.selector);
        grd.sweepRevoked(AGENT, payer);
    }

    function test_sweepRevoked_revertsWithNoLiveRating() public {
        vm.expectRevert(GroundedReputation.NothingToSweep.selector);
        grd.sweepRevoked(AGENT, payer);
    }

    function test_sweepRevoked_decrementsDisputes() public {
        uint256 id = _payAndRate(payer, 0.5e6, 0, "dispute");
        _groundIt(payer, PK_PAYER, id, 0, true);
        reputation.revokeFeedback(AGENT, payer, IDX);

        grd.sweepRevoked(AGENT, payer);
        assertEq(grd.disputeCount(AGENT), 0, "revoked disputes stop counting too");
    }

    function test_meets_needsBothScoreAndReviewerCount() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        _groundIt(payer, PK_PAYER, id, 80, false);

        assertTrue(grd.meets(AGENT, 75, 1));
        assertFalse(grd.meets(AGENT, 85, 1), "score below the floor");
        assertFalse(grd.meets(AGENT, 75, 5), "too few reviewers");
    }

    function test_ownerChangedAt_recordsLazilyOnNextRating() public {
        uint256 id = _payAndRate(payer, 0.5e6, 80, "quality");
        _groundIt(payer, PK_PAYER, id, 80, false);
        assertEq(grd.scoreOf(AGENT).ownerChangedAt, 0, "first rating only records the owner");

        address newOwner = makeAddr("newOwner");
        identity.setAgent(AGENT, newOwner, agentWallet);

        vm.warp(block.timestamp + 1 days);
        deadline = uint40(block.timestamp + 1 hours);
        vm.prank(payer);
        uint256 second = router.pay(AGENT, address(usdc), 0.5e6);
        reputation.setFeedback(AGENT, payer, IDX, int128(80), 0, "quality");
        _groundIt(payer, PK_PAYER, second, 80, false);

        assertEq(grd.scoreOf(AGENT).ownerChangedAt, uint40(block.timestamp), "transfer seen on the next rating");
    }
}
