// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ScoringLib} from "../../src/lib/ScoringLib.sol";

/// @dev `median` takes a storage pointer, so the fuzz harness needs real storage to point at.
contract ScoringLibTest is Test {
    uint64[21] internal histogram;

    function test_bucketOf_roundsHalfUp() public pure {
        assertEq(ScoringLib.bucketOf(0), 0);
        assertEq(ScoringLib.bucketOf(2), 0, "2 rounds down");
        assertEq(ScoringLib.bucketOf(3), 1, "3 rounds up");
        assertEq(ScoringLib.bucketOf(50), 10);
        assertEq(ScoringLib.bucketOf(98), 20);
        assertEq(ScoringLib.bucketOf(100), 20);
    }

    function test_bucketOf_revertsAbove100() public {
        vm.expectRevert(abi.encodeWithSelector(ScoringLib.ScoreOutOfRange.selector, uint256(101)));
        this.bucketOf(101);
    }

    function bucketOf(uint8 score) external pure returns (uint8) {
        return ScoringLib.bucketOf(score);
    }

    /// @dev The table in TRD §4: 0.01-0.09 -> 1, 0.10-0.29 -> 2, 0.30-0.69 -> 3, >= 0.70 -> 4.
    function test_weightOf_matchesTable() public pure {
        assertEq(ScoringLib.weightOf(10_000), 1, "0.01");
        assertEq(ScoringLib.weightOf(99_999), 1, "0.099");
        assertEq(ScoringLib.weightOf(100_000), 2, "0.10");
        assertEq(ScoringLib.weightOf(299_999), 2, "0.29");
        assertEq(ScoringLib.weightOf(300_000), 3, "0.30");
        assertEq(ScoringLib.weightOf(699_999), 3, "0.69");
        assertEq(ScoringLib.weightOf(700_000), 4, "0.70");
        assertEq(ScoringLib.weightOf(1_000_000_000), 4, "1000 USDC still caps at 4");
    }

    function testFuzz_weightOf_neverExceedsCap(uint96 amount) public pure {
        uint8 w = ScoringLib.weightOf(amount);
        assertGe(w, 1);
        assertLe(w, ScoringLib.WEIGHT_CAP);
    }

    function test_median_emptyHistogramIsZero() public view {
        assertEq(ScoringLib.median(histogram, 0), 0);
    }

    function test_median_singleRating() public {
        histogram[14] = 3; // bucket 14 == score 70
        assertEq(ScoringLib.median(histogram, 3), 70);
    }

    function test_median_weightBeatsCount() public {
        histogram[0] = 1; // one cheap 0-score rating
        histogram[20] = 4; // one heavy 100-score rating
        assertEq(ScoringLib.median(histogram, 5), 100, "the heavier rating carries the median");
    }

    function test_median_evenMassTakesLowerBucket() public {
        histogram[4] = 1; // score 20
        histogram[16] = 1; // score 80
        assertEq(ScoringLib.median(histogram, 2), 20, "ties resolve to the lower bucket");
    }

    /// @dev Reference: expand the histogram into a sorted list of weights and pick the lower
    ///      weighted median the same way the library defines it.
    function testFuzz_median_matchesReference(uint8[21] memory weights) public {
        uint64 mass;
        for (uint256 i = 0; i < 21; ++i) {
            histogram[i] = weights[i];
            mass += weights[i];
        }

        uint8 expected;
        if (mass == 0) {
            expected = 0;
        } else {
            uint256 cumulative;
            for (uint256 i = 0; i < 21; ++i) {
                cumulative += weights[i];
                if (cumulative * 2 >= mass) {
                    expected = uint8(i * 5);
                    break;
                }
            }
        }

        assertEq(ScoringLib.median(histogram, mass), expected);
    }
}
