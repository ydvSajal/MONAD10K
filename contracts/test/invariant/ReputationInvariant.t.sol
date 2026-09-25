// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "../Base.t.sol";
import {GroundedReputation} from "../../src/GroundedReputation.sol";
import {ReviewerRegistry} from "../../src/ReviewerRegistry.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../../src/interfaces/IReputationRegistry.sol";
import {Score, WebAuthnSig} from "../../src/types/GroundedTypes.sol";
import {MockReputationRegistry} from "../mocks/Mocks.sol";
import {WebAuthnHelper} from "../utils/WebAuthnHelper.sol";

uint256 constant REVIEWERS = 4;
uint256 constant AGENTS = 2;
uint64 constant IDX = 1;

/// @dev Random traffic: reviewers pay, post feedback, ground it (quality or dispute), replace their own
///      rating, and revoke-then-sweep. Every call is allowed to fail; the invariant is about what remains.
contract ReputationHandler is WebAuthnHelper {
    GroundedReputation internal grd;
    MockReputationRegistry internal reputation;
    ReputationInvariantTest internal env;
    bytes32 internal rp;
    address[] internal who;
    uint256[] internal pks;

    constructor(
        GroundedReputation grd_,
        MockReputationRegistry reputation_,
        ReputationInvariantTest env_,
        bytes32 rp_,
        address[] memory who_,
        uint256[] memory pks_
    ) {
        grd = grd_;
        reputation = reputation_;
        env = env_;
        rp = rp_;
        who = who_;
        pks = pks_;
    }

    function rate(uint256 reviewerSeed, uint256 agentSeed, uint256 amount, uint8 score, bool dispute) external {
        uint256 i = reviewerSeed % REVIEWERS;
        uint256 agentId = 1 + (agentSeed % AGENTS);
        amount = bound(amount, 10_000, 2e6);
        score = uint8(bound(score, 0, 100));
        address reviewer = who[i];

        uint256 receiptId = env.payFor(reviewer, agentId, amount);
        reputation.setFeedback(agentId, reviewer, IDX, int128(uint128(score)), 0, dispute ? "dispute" : "quality");

        // A dispute is stored with score 0, and that is what the passkey has to sign.
        uint40 deadline = uint40(block.timestamp + 1 hours);
        bytes32 digest = grd.groundDigest(receiptId, agentId, IDX, dispute ? 0 : score, dispute, reviewer, deadline);
        WebAuthnSig memory sig = _webauthnSig(pks[i], rp, FLAGS_UP_UV, digest);
        vm.prank(reviewer);
        try grd.ground(receiptId, IDX, deadline, sig) {} catch {}
    }

    function revokeAndSweep(uint256 reviewerSeed, uint256 agentSeed) external {
        address reviewer = who[reviewerSeed % REVIEWERS];
        uint256 agentId = 1 + (agentSeed % AGENTS);
        reputation.revokeFeedback(agentId, reviewer, IDX);
        try grd.sweepRevoked(agentId, reviewer) {} catch {}
    }
}

contract ReputationInvariantTest is Base, WebAuthnHelper {
    GroundedReputation internal grd;
    address[] internal reviewerAddrs;

    /// @dev Called by the handler: mint, approve and pay as `reviewer` through the real router.
    function payFor(address reviewer, uint256 agentId, uint256 amount) external returns (uint256) {
        usdc.mint(reviewer, amount);
        vm.startPrank(reviewer);
        usdc.approve(address(router), amount);
        uint256 id = router.pay(agentId, address(usdc), amount);
        vm.stopPrank();
        return id;
    }

    function setUp() public override {
        super.setUp();
        identity.setAgent(2, makeAddr("agentOwner2"), makeAddr("agentWallet2"));

        bytes32 rp = _rpIdHash("grounded.sajal.sbs");
        MockReputationRegistry reputation = new MockReputationRegistry();
        ReviewerRegistry reviewers = new ReviewerRegistry(rp);
        GroundedReputation deployed = new GroundedReputation(
            IIdentityRegistry(address(identity)), IReputationRegistry(address(reputation)), receipts, router, reviewers
        );
        vm.etch(grounded, address(deployed).code);
        grd = GroundedReputation(grounded);

        uint256[] memory pks = new uint256[](REVIEWERS);
        for (uint256 i = 0; i < REVIEWERS; i++) {
            address r = makeAddr(string.concat("reviewer", vm.toString(i)));
            reviewerAddrs.push(r);
            pks[i] = 0xB0B0 + i;
            (uint256 qx, uint256 qy) = vm.publicKeyP256(pks[i]);
            bytes32 digest = reviewers.bindDigest(r, qx, qy, 0);
            WebAuthnSig memory proof = _webauthnSig(pks[i], rp, FLAGS_UP_UV, digest);
            vm.prank(r);
            reviewers.bind(qx, qy, proof);
        }

        ReputationHandler handler = new ReputationHandler(grd, reputation, this, rp, reviewerAddrs, pks);
        targetContract(address(handler));
    }

    /// @notice The score is exactly the weighted median of the ratings the contract says are live, and the
    ///         counters add up. Holds through replacements, disputes, revocations and sweeps.
    function invariant_scoreEqualsMedianOfLiveRatings() public view {
        for (uint256 agentId = 1; agentId <= AGENTS; agentId++) {
            uint64 mass;
            uint32 live;
            uint32 disputes;
            uint64[21] memory hist;
            for (uint256 i = 0; i < REVIEWERS; i++) {
                (uint8 bucket, uint8 weight,, bool isDispute, bool exists) = grd.liveRating(agentId, reviewerAddrs[i]);
                if (!exists) continue;
                if (isDispute) {
                    disputes++;
                } else {
                    mass += weight;
                    live++;
                    hist[bucket] += weight;
                }
            }

            Score memory s = grd.scoreOf(agentId);
            assertEq(uint256(s.weightMass), uint256(mass), "weight mass == sum of live weights");
            assertEq(uint256(s.reviewers), uint256(live), "reviewer count == live quality ratings");
            assertEq(uint256(grd.disputeCount(agentId)), uint256(disputes), "dispute count == live disputes");

            uint8 want;
            uint64 cumulative;
            for (uint256 b = 0; b < 21 && mass > 0; b++) {
                cumulative += hist[b];
                if (cumulative * 2 >= mass) {
                    want = uint8(b * 5);
                    break;
                }
            }
            assertEq(uint256(s.median), uint256(want), "median == reference weighted median");
        }
    }
}
