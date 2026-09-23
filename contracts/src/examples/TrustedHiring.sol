// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GroundedGate} from "../GroundedGate.sol";
import {IGroundedReputation} from "../interfaces/IGroundedReputation.sol";

/// @notice Example integrator: a client may only hire an agent with a grounded score of 70+ from
///         3+ paying reviewers. Not deployed; it exists to show the gate in a few lines.
contract TrustedHiring is GroundedGate {
    mapping(address client => uint256 agentId) public hired;

    event Hired(address indexed client, uint256 indexed agentId);

    constructor(IGroundedReputation grounded_) GroundedGate(grounded_, 70, 3) {}

    function hire(uint256 agentId) external onlyTrusted(agentId) {
        hired[msg.sender] = agentId;
        emit Hired(msg.sender, agentId);
    }
}
