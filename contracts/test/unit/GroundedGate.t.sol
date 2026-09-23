// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {GroundedGate} from "../../src/GroundedGate.sol";
import {TrustedHiring} from "../../src/examples/TrustedHiring.sol";
import {IGroundedReputation} from "../../src/interfaces/IGroundedReputation.sol";

/// @dev Stands in for `GroundedReputation`: an agent passes iff it meets the recorded thresholds.
contract MockGrounded is IGroundedReputation {
    mapping(uint256 => uint8) public median;
    mapping(uint256 => uint32) public reviewers;

    function set(uint256 agentId, uint8 median_, uint32 reviewers_) external {
        median[agentId] = median_;
        reviewers[agentId] = reviewers_;
    }

    function meets(uint256 agentId, uint8 minScore, uint32 minReviewers) external view returns (bool) {
        return reviewers[agentId] >= minReviewers && median[agentId] >= minScore;
    }
}

contract GroundedGateTest is Test {
    MockGrounded internal grounded = new MockGrounded();
    TrustedHiring internal hiring = new TrustedHiring(grounded);

    function test_hire_passesTrustedAgent() public {
        grounded.set(7, 70, 3);
        hiring.hire(7);
        assertEq(hiring.hired(address(this)), 7);
    }

    function test_hire_revertsBelowMinScore() public {
        grounded.set(7, 69, 10);
        vm.expectRevert(abi.encodeWithSelector(GroundedGate.AgentNotTrusted.selector, 7));
        hiring.hire(7);
    }

    function test_hire_revertsBelowMinReviewers() public {
        grounded.set(7, 100, 2);
        vm.expectRevert(abi.encodeWithSelector(GroundedGate.AgentNotTrusted.selector, 7));
        hiring.hire(7);
    }

    function test_hire_revertsForUnratedAgent() public {
        vm.expectRevert(abi.encodeWithSelector(GroundedGate.AgentNotTrusted.selector, 7));
        hiring.hire(7);
    }

    function test_thresholdsAreImmutableConfig() public view {
        assertEq(address(hiring.grounded()), address(grounded));
        assertEq(hiring.minScore(), 70);
        assertEq(hiring.minReviewers(), 3);
    }
}
