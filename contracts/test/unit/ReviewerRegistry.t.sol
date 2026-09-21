// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ReviewerRegistry} from "../../src/ReviewerRegistry.sol";
import {WebAuthnSig} from "../../src/types/GroundedTypes.sol";
import {WebAuthnHelper} from "../utils/WebAuthnHelper.sol";

contract ReviewerRegistryTest is Test, WebAuthnHelper {
    ReviewerRegistry internal reg;
    bytes32 internal rp;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal constant PK_A = 0xA11CE;
    uint256 internal constant PK_B = 0xB0B;

    function setUp() public {
        rp = _rpIdHash("localhost");
        reg = new ReviewerRegistry(rp);
    }

    function _proof(uint256 pk, address who, bytes1 flags, bytes32 rpHash) internal view returns (WebAuthnSig memory) {
        bytes32 digest = _digest(pk, who);
        return _webauthnSig(pk, rpHash, flags, digest);
    }

    function _digest(uint256 pk, address who) internal view returns (bytes32) {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(pk);
        return reg.bindDigest(who, qx, qy, reg.nonces(who));
    }

    function _bind(address who, uint256 pk) internal {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(pk);
        WebAuthnSig memory p = _proof(pk, who, FLAGS_UP_UV, rp);
        vm.prank(who);
        reg.bind(qx, qy, p);
    }

    function test_bind_storesKeyAndBumpsNonce() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, alice, FLAGS_UP_UV, rp);

        vm.expectEmit(true, true, false, true, address(reg));
        emit ReviewerRegistry.ReviewerBound(alice, keccak256(abi.encode(qx, qy)), qx, qy);
        vm.prank(alice);
        reg.bind(qx, qy, p);

        (uint256 kx, uint256 ky) = reg.keyOf(alice);
        assertEq(kx, qx);
        assertEq(ky, qy);
        assertEq(reg.reviewerOf(keccak256(abi.encode(qx, qy))), alice);
        assertEq(reg.nonces(alice), 1);
    }

    function test_bind_revertsOnWrongKeySignature() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _webauthnSig(PK_B, rp, FLAGS_UP_UV, _digest(PK_A, alice)); // right challenge, wrong signer
        vm.prank(alice);
        vm.expectRevert(ReviewerRegistry.BadSignature.selector);
        reg.bind(qx, qy, p);
    }

    function test_bind_revertsWhenUserVerificationMissing() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, alice, FLAGS_UP_ONLY, rp);
        vm.prank(alice);
        vm.expectRevert(ReviewerRegistry.BadSignature.selector);
        reg.bind(qx, qy, p);
    }

    function test_bind_revertsOnWrongRpId() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, alice, FLAGS_UP_UV, _rpIdHash("evil.example"));
        vm.prank(alice);
        vm.expectRevert(ReviewerRegistry.BadSignature.selector);
        reg.bind(qx, qy, p);
    }

    function test_bind_revertsOnShortAuthenticatorData() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, alice, FLAGS_UP_UV, rp);
        p.authenticatorData = new bytes(36);
        vm.prank(alice);
        vm.expectRevert(ReviewerRegistry.BadSignature.selector);
        reg.bind(qx, qy, p);
    }

    function test_bind_proofIsBoundToCaller() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, alice, FLAGS_UP_UV, rp);
        vm.prank(bob); // bob replays alice's proof
        vm.expectRevert(ReviewerRegistry.BadSignature.selector);
        reg.bind(qx, qy, p);
    }

    function test_bind_replayFailsAfterNonceBump() public {
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, alice, FLAGS_UP_UV, rp);
        vm.startPrank(alice);
        reg.bind(qx, qy, p);
        vm.expectRevert(ReviewerRegistry.BadSignature.selector);
        reg.bind(qx, qy, p);
        vm.stopPrank();
    }

    function test_bind_revertsWhenKeyBoundToAnotherReviewer() public {
        _bind(alice, PK_A);
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        WebAuthnSig memory p = _proof(PK_A, bob, FLAGS_UP_UV, rp); // valid proof, key already taken
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(ReviewerRegistry.KeyAlreadyBound.selector, keccak256(abi.encode(qx, qy)))
        );
        reg.bind(qx, qy, p);
    }

    function test_bind_rotationFreesOldKey() public {
        _bind(alice, PK_A);
        _bind(alice, PK_B);

        (uint256 ax, uint256 ay) = vm.publicKeyP256(PK_A);
        (uint256 bx, uint256 by) = vm.publicKeyP256(PK_B);
        (uint256 kx, uint256 ky) = reg.keyOf(alice);
        assertEq(kx, bx);
        assertEq(ky, by);
        assertEq(reg.reviewerOf(keccak256(abi.encode(ax, ay))), address(0), "old key released");
        assertEq(reg.nonces(alice), 2);

        _bind(bob, PK_A); // freed key can be claimed by someone else
        assertEq(reg.reviewerOf(keccak256(abi.encode(ax, ay))), bob);
    }

    function test_bind_sameKeyRebindKeepsMapping() public {
        _bind(alice, PK_A);
        _bind(alice, PK_A);
        (uint256 qx, uint256 qy) = vm.publicKeyP256(PK_A);
        assertEq(reg.reviewerOf(keccak256(abi.encode(qx, qy))), alice);
        assertEq(reg.nonces(alice), 2);
    }

    function test_keyOf_zeroForUnbound() public view {
        (uint256 qx, uint256 qy) = reg.keyOf(alice);
        assertEq(qx, 0);
        assertEq(qy, 0);
    }
}
