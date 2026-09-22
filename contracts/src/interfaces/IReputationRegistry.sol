// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Subset of the ERC-8004 Reputation Registry that Grounded reads.
/// @dev Verified against the deployed implementation on Monad testnet (18 Sep). Grounded never
///      writes here: `giveFeedback` is always called by the reviewer directly.
interface IReputationRegistry {
    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked);

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
}
