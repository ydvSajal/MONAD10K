// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IReputationRegistry} from "../interfaces/IReputationRegistry.sol";

/// @title Erc8004Adapter
/// @notice The only place that knows the ERC-8004 feedback encoding. If the registry's shape
///         changes, this file changes and nothing else does (TRD §2.5).
/// @dev Grounded accepts exactly two tags on a fixed 0..100 integer scale. `valueDecimals != 0`
///      is rejected rather than rescaled: a rescale would silently reinterpret a reviewer's number.
library Erc8004Adapter {
    bytes32 internal constant TAG_QUALITY = keccak256(bytes("quality"));
    bytes32 internal constant TAG_DISPUTE = keccak256(bytes("dispute"));

    /// @notice Read one feedback entry and check it is gradeable.
    /// @dev A non-existent index reads back as an empty tag, so the tag check doubles as the
    ///      existence check and saves a `getLastIndex` call.
    /// @return ok   False when the entry is missing, revoked, off-scale, or not one of our tags.
    /// @return score Clamped to 0..100 and only meaningful when `ok`.
    /// @return isDispute True for `tag1 == "dispute"`, which is counted but never scored.
    function readRating(IReputationRegistry reputation, uint256 agentId, address client, uint64 feedbackIndex)
        internal
        view
        returns (bool ok, uint8 score, bool isDispute)
    {
        (int128 value, uint8 valueDecimals, string memory tag1,, bool revoked) =
            reputation.readFeedback(agentId, client, feedbackIndex);

        if (revoked || valueDecimals != 0) return (false, 0, false);
        if (value < 0 || value > 100) return (false, 0, false);

        bytes32 tag = keccak256(bytes(tag1));
        if (tag == TAG_DISPUTE) return (true, 0, true);
        if (tag != TAG_QUALITY) return (false, 0, false);

        // casting to 'uint8' is safe because value is checked to be within 0..100 above
        // forge-lint: disable-next-line(unsafe-typecast)
        return (true, uint8(uint128(value)), false);
    }

    /// @notice Whether the entry behind a grounded rating has since been revoked.
    function isRevoked(IReputationRegistry reputation, uint256 agentId, address client, uint64 feedbackIndex)
        internal
        view
        returns (bool)
    {
        (,,,, bool revoked) = reputation.readFeedback(agentId, client, feedbackIndex);
        return revoked;
    }
}
