// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Subset of the ERC-8004 Identity Registry that Grounded reads.
/// @dev Verified against the deployed implementation on Monad testnet (18 Sep).
interface IIdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
    function getApproved(uint256 agentId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    /// @dev Defaults to the agent owner when unset.
    function getAgentWallet(uint256 agentId) external view returns (address);
}
