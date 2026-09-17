// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Receipt, ReceiptStatus} from "./types/GroundedTypes.sol";

/// @title ReceiptRegistry
/// @notice Records of "this payer paid this agent". One receipt buys exactly one rating.
/// @dev No owner, no admin, no upgrade path. `router` and `grounded` are set once at
///      construction from precomputed CREATE addresses (see script/Deploy.s.sol).
contract ReceiptRegistry {
    uint256 public constant RECEIPT_TTL = 30 days;

    address public immutable router;
    address public immutable grounded;

    mapping(uint256 id => Receipt) private _receipts;
    uint256 public nextId = 1;

    event ReceiptIssued(
        uint256 indexed id, uint256 indexed agentId, address indexed payer, address token, uint96 amount
    );
    event ReceiptConsumed(uint256 indexed id, uint256 indexed agentId, address indexed payer);

    error NotRouter();
    error NotGrounded();
    error ReceiptNotIssued(uint256 id);
    error ReceiptExpired(uint256 id);

    constructor(address router_, address grounded_) {
        router = router_;
        grounded = grounded_;
    }

    modifier onlyRouter() {
        if (msg.sender != router) revert NotRouter();
        _;
    }

    function issue(Receipt calldata r) external onlyRouter returns (uint256 id) {
        id = nextId++;
        _receipts[id] = r;
        emit ReceiptIssued(id, r.agentId, r.payer, r.token, r.amount);
    }

    /// @notice Burns the receipt's right to produce a rating. Callable only by GroundedReputation.
    function consume(uint256 id) external {
        if (msg.sender != grounded) revert NotGrounded();
        Receipt storage r = _receipts[id];
        if (r.status != ReceiptStatus.Issued) revert ReceiptNotIssued(id);
        if (block.timestamp > uint256(r.paidAt) + RECEIPT_TTL) revert ReceiptExpired(id);
        r.status = ReceiptStatus.Consumed;
        emit ReceiptConsumed(id, r.agentId, r.payer);
    }

    function get(uint256 id) external view returns (Receipt memory) {
        return _receipts[id];
    }

    /// @notice True only while the receipt can still be grounded.
    function isValid(uint256 id) external view returns (bool) {
        Receipt storage r = _receipts[id];
        return r.status == ReceiptStatus.Issued && block.timestamp <= uint256(r.paidAt) + RECEIPT_TTL;
    }
}
