// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {WebAuthnSig} from "../../src/types/GroundedTypes.sol";

/// @dev Software authenticator for tests: builds authenticatorData + clientDataJSON and signs with vm.signP256.
abstract contract WebAuthnHelper is Test {
    uint256 private constant P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;
    uint256 private constant P256_HALF_N = P256_N / 2;
    bytes1 internal constant FLAGS_UP_UV = 0x05;
    bytes1 internal constant FLAGS_UP_ONLY = 0x01;

    function _rpIdHash(string memory rpId) internal pure returns (bytes32) {
        return sha256(bytes(rpId));
    }

    function _webauthnSig(uint256 privateKey, bytes32 rpIdHash, bytes1 flags, bytes32 challenge)
        internal
        pure
        returns (WebAuthnSig memory sig)
    {
        bytes memory authData = abi.encodePacked(rpIdHash, flags, uint32(0));
        string memory clientData = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64.encodeURL(abi.encodePacked(challenge)),
            '","origin":"http://localhost","crossOrigin":false}'
        );
        bytes32 signedHash = sha256(abi.encodePacked(authData, sha256(bytes(clientData))));
        (bytes32 r, bytes32 s) = vm.signP256(privateKey, signedHash);
        if (uint256(s) > P256_HALF_N) s = bytes32(P256_N - uint256(s));

        sig = WebAuthnSig({
            authenticatorData: authData,
            clientDataJSON: clientData,
            challengeIndex: 23, // '{' + '"type":"webauthn.get"' (21) + ',' precede the challenge key
            typeIndex: 1,
            r: uint256(r),
            s: uint256(s)
        });
    }
}
