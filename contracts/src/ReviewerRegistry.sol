// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {GroundedWebAuthn} from "./lib/GroundedWebAuthn.sol";
import {WebAuthnSig} from "./types/GroundedTypes.sol";

/// @title ReviewerRegistry
/// @notice Binds an address to a P256 passkey. Ratings must later be signed by that passkey.
/// @dev No owner, no admin. One passkey maps to one address; an address may rotate its key.
contract ReviewerRegistry is EIP712 {
    struct Key {
        uint256 qx;
        uint256 qy;
    }

    bytes32 public constant BIND_TYPEHASH = keccak256("Bind(address reviewer,uint256 qx,uint256 qy,uint256 nonce)");

    /// @notice sha256(rpId), fixed at construction. A different rpId means a different deployment.
    bytes32 public immutable RP_ID_HASH;

    mapping(address reviewer => uint256) public nonces;
    mapping(bytes32 keyHash => address) public reviewerOf;
    mapping(address reviewer => Key) private _keys;

    event ReviewerBound(address indexed reviewer, bytes32 indexed keyHash, uint256 qx, uint256 qy);

    error BadSignature();
    error KeyAlreadyBound(bytes32 keyHash);

    constructor(bytes32 rpIdHash) EIP712("GroundedReviewerRegistry", "1") {
        RP_ID_HASH = rpIdHash;
    }

    /// @notice Bind (or rotate to) the passkey `(qx, qy)`. `proof` is that passkey signing `bindDigest`.
    function bind(uint256 qx, uint256 qy, WebAuthnSig calldata proof) external {
        uint256 nonce = nonces[msg.sender];
        if (!GroundedWebAuthn.verify(RP_ID_HASH, bindDigest(msg.sender, qx, qy, nonce), proof, qx, qy)) {
            revert BadSignature();
        }

        bytes32 keyHash = keccak256(abi.encode(qx, qy));
        address holder = reviewerOf[keyHash];
        if (holder != address(0) && holder != msg.sender) revert KeyAlreadyBound(keyHash);

        Key memory old = _keys[msg.sender];
        if (old.qx != 0 || old.qy != 0) delete reviewerOf[keccak256(abi.encode(old.qx, old.qy))];

        _keys[msg.sender] = Key(qx, qy);
        reviewerOf[keyHash] = msg.sender;
        nonces[msg.sender] = nonce + 1;
        emit ReviewerBound(msg.sender, keyHash, qx, qy);
    }

    function keyOf(address reviewer) external view returns (uint256 qx, uint256 qy) {
        Key memory k = _keys[reviewer];
        return (k.qx, k.qy);
    }

    /// @notice The 32-byte challenge the passkey must sign. Chain and contract are in the EIP-712 domain.
    function bindDigest(address reviewer, uint256 qx, uint256 qy, uint256 nonce) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(BIND_TYPEHASH, reviewer, qx, qy, nonce)));
    }
}
