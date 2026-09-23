// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {ReceiptRegistry} from "./ReceiptRegistry.sol";
import {ReceiptRouter} from "./ReceiptRouter.sol";
import {ReviewerRegistry} from "./ReviewerRegistry.sol";
import {Erc8004Adapter} from "./adapters/Erc8004Adapter.sol";
import {IGroundedReputation} from "./interfaces/IGroundedReputation.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";
import {GroundedWebAuthn} from "./lib/GroundedWebAuthn.sol";
import {ScoringLib} from "./lib/ScoringLib.sol";
import {Receipt, ReceiptStatus, Score, WebAuthnSig} from "./types/GroundedTypes.sol";

/// @title GroundedReputation
/// @notice A rating counts only if the reviewer paid the agent onchain and signs with their bound
///         passkey. One receipt buys one rating; one reviewer holds one live rating per agent.
/// @dev No owner, no admin, no upgrade path. Everything here is either a read of ERC-8004 or a
///      write to our own storage; `giveFeedback` is never called from this contract.
contract GroundedReputation is EIP712, IGroundedReputation {
    using ScoringLib for uint64[21];

    /// @dev One slot. `feedbackIndex` is what makes `sweepRevoked` possible.
    struct Live {
        uint8 bucket;
        uint8 weight;
        uint64 feedbackIndex;
        bool exists;
        bool isDispute;
    }

    /// @dev Everything `ground` writes lives in exactly one slot (256 bits on the nose); `lastOwner`
    ///      sits in a second slot that is only touched when the agent actually changes hands.
    ///      `paid6dp` saturates at ~1.09M USDC: it is a display total, and the indexer carries the
    ///      exact figure from `ReceiptIssued`.
    struct AgentState {
        uint32 reviewers;
        uint32 receipts;
        uint32 disputes;
        uint40 weightMass;
        uint40 paid6dp;
        uint40 updatedAt;
        uint40 ownerChangedAt;
        // second slot
        address lastOwner;
    }

    bytes32 public constant GROUND_TYPEHASH = keccak256(
        "Ground(uint256 receiptId,uint256 agentId,uint64 feedbackIndex,uint8 score,bool isDispute,address reviewer,uint40 deadline)"
    );

    IIdentityRegistry public immutable identity;
    IReputationRegistry public immutable reputation;
    ReceiptRegistry public immutable receipts;
    ReceiptRouter public immutable router;
    ReviewerRegistry public immutable reviewers;
    /// @dev Taken from the reviewer registry so the two can never disagree about the domain.
    bytes32 public immutable RP_ID_HASH;
    /// @dev Copied from the receipt registry at construction; both are fixed for life.
    uint256 public immutable RECEIPT_TTL;

    mapping(uint256 agentId => uint64[21]) private _histogram;
    mapping(uint256 agentId => mapping(address reviewer => Live)) private _live;
    mapping(uint256 agentId => AgentState) private _agents;

    event Grounded(
        uint256 indexed agentId,
        address indexed reviewer,
        uint256 indexed receiptId,
        uint64 feedbackIndex,
        uint8 score,
        uint8 weight,
        bool isDispute
    );
    event Swept(uint256 indexed agentId, address indexed reviewer, uint64 feedbackIndex);
    event OwnerChanged(uint256 indexed agentId, address previousOwner, address newOwner);

    error Expired();
    error BadReceipt(uint256 receiptId);
    error NotPayer(address payer);
    error ExcludedReviewer();
    error BadFeedback(uint64 feedbackIndex);
    error NoPasskey();
    error BadSignature();
    error NothingToSweep();
    error StillValid();

    constructor(
        IIdentityRegistry identity_,
        IReputationRegistry reputation_,
        ReceiptRegistry receipts_,
        ReceiptRouter router_,
        ReviewerRegistry reviewers_
    ) EIP712("GroundedReputation", "1") {
        identity = identity_;
        reputation = reputation_;
        receipts = receipts_;
        router = router_;
        reviewers = reviewers_;
        RP_ID_HASH = reviewers_.RP_ID_HASH();
        RECEIPT_TTL = receipts_.RECEIPT_TTL();
    }

    /// @notice Turn a paid receipt plus an existing ERC-8004 feedback entry into a counted rating.
    /// @dev Check order is cheapest-first (TRD §2.5); every branch has its own error and test.
    function ground(uint256 receiptId, uint64 feedbackIndex, uint40 deadline, WebAuthnSig calldata sig) external {
        if (block.timestamp > deadline) revert Expired();

        Receipt memory r = receipts.get(receiptId);
        if (r.status != ReceiptStatus.Issued || block.timestamp > uint256(r.paidAt) + RECEIPT_TTL) {
            revert BadReceipt(receiptId);
        }
        if (r.payer != msg.sender) revert NotPayer(r.payer);

        address owner = _requireNotExcluded(r.agentId);

        (bool ok, uint8 score, bool isDispute) =
            Erc8004Adapter.readRating(reputation, r.agentId, msg.sender, feedbackIndex);
        if (!ok) revert BadFeedback(feedbackIndex);

        _requireSigned(receiptId, r.agentId, feedbackIndex, score, isDispute, deadline, sig);

        receipts.consume(receiptId);
        uint256 paid6dp = router.normalize(r.token, r.amount);
        uint8 weight = ScoringLib.weightOf(paid6dp);
        _record(r.agentId, msg.sender, feedbackIndex, score, weight, isDispute, paid6dp, owner);

        emit Grounded(r.agentId, msg.sender, receiptId, feedbackIndex, score, weight, isDispute);
    }

    /// @notice Remove a rating whose ERC-8004 feedback was revoked after it was grounded.
    /// @dev Permissionless and unauthenticated on purpose: anyone may repair the histogram, and the
    ///      only thing that decides the outcome is what the registry says right now.
    function sweepRevoked(uint256 agentId, address reviewer) external {
        Live memory live = _live[agentId][reviewer];
        if (!live.exists) revert NothingToSweep();
        if (!Erc8004Adapter.isRevoked(reputation, agentId, reviewer, live.feedbackIndex)) revert StillValid();

        AgentState storage a = _agents[agentId];
        if (live.isDispute) {
            a.disputes -= 1;
        } else {
            _histogram[agentId][live.bucket] -= live.weight;
            a.weightMass -= live.weight;
            a.reviewers -= 1;
        }
        delete _live[agentId][reviewer];
        // casting to 'uint40' is safe until year 36812
        // forge-lint: disable-next-line(unsafe-typecast)
        a.updatedAt = uint40(block.timestamp);

        emit Swept(agentId, reviewer, live.feedbackIndex);
    }

    /// @notice The agent's grounded score, with the median computed from the histogram on read.
    function scoreOf(uint256 agentId) public view returns (Score memory) {
        AgentState storage a = _agents[agentId];
        return Score({
            median: _histogram[agentId].median(a.weightMass),
            reviewers: a.reviewers,
            receipts: a.receipts,
            paid: a.paid6dp,
            weightMass: a.weightMass,
            updatedAt: a.updatedAt,
            ownerChangedAt: a.ownerChangedAt
        });
    }

    /// @notice Onchain trust check for consumers (see `GroundedGate`).
    function meets(uint256 agentId, uint8 minScore, uint32 minReviewers) external view returns (bool) {
        AgentState storage a = _agents[agentId];
        if (a.reviewers < minReviewers) return false;
        return _histogram[agentId].median(a.weightMass) >= minScore;
    }

    function liveRating(uint256 agentId, address reviewer)
        external
        view
        returns (uint8 bucket, uint8 weight, uint64 feedbackIndex, bool isDispute, bool exists)
    {
        Live memory live = _live[agentId][reviewer];
        return (live.bucket, live.weight, live.feedbackIndex, live.isDispute, live.exists);
    }

    function disputeCount(uint256 agentId) external view returns (uint32) {
        return _agents[agentId].disputes;
    }

    function histogramOf(uint256 agentId) external view returns (uint64[21] memory) {
        return _histogram[agentId];
    }

    /// @notice The 32-byte challenge the reviewer's passkey must sign.
    function groundDigest(
        uint256 receiptId,
        uint256 agentId,
        uint64 feedbackIndex,
        uint8 score,
        bool isDispute,
        address reviewer,
        uint40 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(GROUND_TYPEHASH, receiptId, agentId, feedbackIndex, score, isDispute, reviewer, deadline)
            )
        );
    }

    /// @dev Steps 6 and 7 of the check order, in their own frame to keep `ground` off the stack limit.
    function _requireSigned(
        uint256 receiptId,
        uint256 agentId,
        uint64 feedbackIndex,
        uint8 score,
        bool isDispute,
        uint40 deadline,
        WebAuthnSig calldata sig
    ) private view {
        (uint256 qx, uint256 qy) = reviewers.keyOf(msg.sender);
        if (qx == 0 && qy == 0) revert NoPasskey();

        bytes32 digest = groundDigest(receiptId, agentId, feedbackIndex, score, isDispute, msg.sender, deadline);
        if (!GroundedWebAuthn.verify(RP_ID_HASH, digest, sig, qx, qy)) revert BadSignature();
    }

    /// @dev TRD §2.5 step 4. The agent's own side must not be able to rate itself.
    function _requireNotExcluded(uint256 agentId) private view returns (address owner) {
        owner = identity.ownerOf(agentId);
        if (
            msg.sender == owner || msg.sender == identity.getApproved(agentId)
                || msg.sender == identity.getAgentWallet(agentId) || identity.isApprovedForAll(owner, msg.sender)
        ) revert ExcludedReviewer();
    }

    /// @dev Replaces the reviewer's previous live rating, so paying twice never doubles their vote.
    function _record(
        uint256 agentId,
        address reviewer,
        uint64 feedbackIndex,
        uint8 score,
        uint8 weight,
        bool isDispute,
        uint256 paid6dp,
        address owner
    ) private {
        AgentState storage a = _agents[agentId];
        Live memory previous = _live[agentId][reviewer];

        if (previous.exists) {
            if (previous.isDispute) {
                a.disputes -= 1;
            } else {
                _histogram[agentId][previous.bucket] -= previous.weight;
                a.weightMass -= previous.weight;
                a.reviewers -= 1;
            }
        }

        uint8 bucket;
        if (isDispute) {
            a.disputes += 1;
        } else {
            bucket = ScoringLib.bucketOf(score);
            _histogram[agentId][bucket] += weight;
            a.weightMass += weight;
            a.reviewers += 1;
        }

        _live[agentId][reviewer] =
            Live({bucket: bucket, weight: weight, feedbackIndex: feedbackIndex, exists: true, isDispute: isDispute});

        a.receipts += 1;
        // Saturating: the running total is a display figure, and a token contrived to overflow
        // it must not be able to brick `ground` for an agent.
        uint256 total = uint256(a.paid6dp) + paid6dp;
        // casting to 'uint40' is safe because the ternary rejects anything above uint40 max
        // forge-lint: disable-next-line(unsafe-typecast)
        a.paid6dp = total > type(uint40).max ? type(uint40).max : uint40(total);
        // casting to 'uint40' is safe until year 36812
        // forge-lint: disable-next-line(unsafe-typecast)
        a.updatedAt = uint40(block.timestamp);

        if (a.lastOwner != owner) {
            if (a.lastOwner != address(0)) {
                // casting to 'uint40' is safe until year 36812
                // forge-lint: disable-next-line(unsafe-typecast)
                a.ownerChangedAt = uint40(block.timestamp);
                emit OwnerChanged(agentId, a.lastOwner, owner);
            }
            a.lastOwner = owner;
        }
    }
}
