// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title ScoringLib
/// @notice Bucketing, payment weighting and the weighted median (TRD §4).
/// @dev Trimming is deliberately absent: dropping equal weight shares from both tails cannot move
///      a weighted median, so it would burn gas for no effect. Robustness comes from the median,
///      the weight cap, and one live rating per reviewer.
library ScoringLib {
    /// @notice Score buckets 0, 5, ... 100.
    uint256 internal constant BUCKETS = 21;
    uint8 internal constant BUCKET_SIZE = 5;
    /// @notice A single reviewer can never count more than this, however much they paid.
    uint8 internal constant WEIGHT_CAP = 4;
    /// @notice 0.10 USDC, normalised to 6 decimals.
    uint256 internal constant WEIGHT_UNIT_6DP = 100_000;
    /// @notice Below this many live reviewers the SDK reports confidence "low".
    uint32 internal constant MIN_REVIEWERS_OK = 5;

    error ScoreOutOfRange(uint256 score);

    /// @notice Bucket index for a 0..100 score, rounding half up.
    function bucketOf(uint8 score) internal pure returns (uint8) {
        if (score > 100) revert ScoreOutOfRange(score);
        // casting to 'uint8' is safe because score <= 100, so the bucket is at most 20
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8((uint256(score) + 2) / BUCKET_SIZE);
    }

    /// @notice Payment weight: 0.01–0.09 -> 1, 0.10–0.29 -> 2, 0.30–0.69 -> 3, >= 0.70 -> 4.
    function weightOf(uint256 amount6dp) internal pure returns (uint8) {
        uint256 w = 1 + Math.log2(1 + amount6dp / WEIGHT_UNIT_6DP);
        // casting to 'uint8' is safe because Math.min caps the result at WEIGHT_CAP
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(Math.min(w, WEIGHT_CAP));
    }

    /// @notice Weighted median: the first bucket whose cumulative weight reaches half the mass.
    /// @dev `mass` is the sum of every live weight for the agent. Mass 0 means no ratings, score 0.
    function median(uint64[21] storage histogram, uint64 mass) internal view returns (uint8) {
        if (mass == 0) return 0;
        uint256 cumulative;
        for (uint256 i = 0; i < BUCKETS; ++i) {
            cumulative += histogram[i];
            if (cumulative * 2 >= mass) return uint8(i * BUCKET_SIZE);
        }
        // Unreachable while `mass` equals the histogram's total, kept so the function is total.
        return 100;
    }
}
