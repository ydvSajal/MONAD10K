// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The one read an onchain integrator needs. Import this, not `GroundedReputation`.
interface IGroundedReputation {
    /// @return True when the agent has at least `minReviewers` live ratings and a grounded median of
    ///         at least `minScore`. An unrated agent has median 0, so any `minScore > 0` refuses it.
    function meets(uint256 agentId, uint8 minScore, uint32 minReviewers) external view returns (bool);
}
