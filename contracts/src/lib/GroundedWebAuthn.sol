// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

import {WebAuthnSig} from "../types/GroundedTypes.sol";

/// @notice OZ WebAuthn plus the one check OZ deliberately omits: the rpIdHash in authenticatorData.
/// @dev Requires UP and UV. Low-s is enforced inside OZ `P256.verify`. Signature counter is ignored.
///      `challenge` is the 32-byte EIP-712 digest; the browser base64url-encodes it as `challenge`.
library GroundedWebAuthn {
    function verify(bytes32 rpIdHash, bytes32 challenge, WebAuthnSig calldata sig, uint256 qx, uint256 qy)
        internal
        view
        returns (bool)
    {
        if (sig.authenticatorData.length < 37 || bytes32(sig.authenticatorData[0:32]) != rpIdHash) return false;
        return WebAuthn.verify(
            abi.encodePacked(challenge),
            WebAuthn.WebAuthnAuth({
                r: bytes32(sig.r),
                s: bytes32(sig.s),
                challengeIndex: sig.challengeIndex,
                typeIndex: sig.typeIndex,
                authenticatorData: sig.authenticatorData,
                clientDataJSON: sig.clientDataJSON
            }),
            bytes32(qx),
            bytes32(qy),
            true
        );
    }
}
