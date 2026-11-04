// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {GroundedWebAuthn} from "./lib/GroundedWebAuthn.sol";
import {WebAuthnSig} from "./types/GroundedTypes.sol";

/// @title ReviewerRegistry
/// @notice Binds an address to a P256 passkey. Ratings must later be signed by that passkey.
/// @dev No owner, no admin. One passkey per wallet, one wallet per passkey, and a binding is final:
///      otherwise a stolen wallet could bind a new key, and the passkey would not be a second factor.
///      A lost passkey means rating from a new wallet.
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
    error AlreadyBound(address reviewer);

    constructor(bytes32 rpIdHash) EIP712("GroundedReviewerRegistry", "1") {
        RP_ID_HASH = rpIdHash;
    }

    /// @notice Bind the passkey `(qx, qy)` to the caller, once. `proof` is that passkey signing `bindDigest`.
    function bind(uint256 qx, uint256 qy, WebAuthnSig calldata proof) external {
        Key memory current = _keys[msg.sender];
        if (current.qx != 0 || current.qy != 0) revert AlreadyBound(msg.sender);

        uint256 nonce = nonces[msg.sender];
        if (!GroundedWebAuthn.verify(RP_ID_HASH, bindDigest(msg.sender, qx, qy, nonce), proof, qx, qy)) {
            revert BadSignature();
        }

        bytes32 keyHash = keccak256(abi.encode(qx, qy));
        if (reviewerOf[keyHash] != address(0)) revert KeyAlreadyBound(keyHash);

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
