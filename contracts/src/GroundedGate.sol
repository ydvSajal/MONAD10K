// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGroundedReputation} from "./interfaces/IGroundedReputation.sol";

/// @title GroundedGate
/// @notice Inherit and put `onlyTrusted(agentId)` on any function that should only serve agents
///         with a grounded reputation. Thresholds are fixed at construction, like everything else.
abstract contract GroundedGate {
    IGroundedReputation public immutable grounded;
    uint8 public immutable minScore;
    uint32 public immutable minReviewers;

    error AgentNotTrusted(uint256 agentId);

    constructor(IGroundedReputation grounded_, uint8 minScore_, uint32 minReviewers_) {
        grounded = grounded_;
        minScore = minScore_;
        minReviewers = minReviewers_;
    }

    modifier onlyTrusted(uint256 agentId) {
        if (!grounded.meets(agentId, minScore, minReviewers)) revert AgentNotTrusted(agentId);
        _;
    }
}
