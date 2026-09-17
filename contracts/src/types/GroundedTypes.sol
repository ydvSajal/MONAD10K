// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

enum ReceiptStatus {
    None,
    Issued,
    Consumed
}

/// @dev One payment, one rating. Packs into two slots.
struct Receipt {
    uint256 agentId;
    address payer;
    address token;
    uint96 amount; // token base units, as transferred
    uint40 paidAt;
    ReceiptStatus status;
}

struct WebAuthnSig {
    bytes authenticatorData;
    string clientDataJSON;
    uint256 challengeIndex;
    uint256 typeIndex;
    uint256 r;
    uint256 s;
}

struct Score {
    uint8 median; // 0..100, bucket * 5
    uint32 reviewers; // live unique reviewers
    uint32 receipts; // consumed receipts, all time
    uint128 paid; // normalised to 6 decimals, all time
    uint64 weightMass; // sum of live weights
    uint40 updatedAt;
    uint40 ownerChangedAt;
}
