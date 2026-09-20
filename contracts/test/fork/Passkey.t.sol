// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ReviewerRegistry} from "../../src/ReviewerRegistry.sol";
import {WebAuthnSig} from "../../src/types/GroundedTypes.sol";
import {WebAuthnHelper} from "../utils/WebAuthnHelper.sol";

/// @notice 21 Sep kill switch: a software passkey must verify through the real P256 precompile (0x0100)
///         on Monad testnet. Skipped when MONAD_FORK_RPC is unset; run with `forge test -n monad`.
contract PasskeyForkTest is Test, WebAuthnHelper {
    function test_bind_usesLivePrecompile() public {
        string memory rpc = vm.envOr("MONAD_FORK_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);
        assertGt(address(0x100).balance + 1, 0); // touch the fork so a dead RPC fails loudly

        ReviewerRegistry reg = new ReviewerRegistry(_rpIdHash("localhost"));
        address alice = makeAddr("alice");
        uint256 pk = 0xA11CE;
        (uint256 qx, uint256 qy) = vm.publicKeyP256(pk);
        WebAuthnSig memory p = _webauthnSig(pk, reg.RP_ID_HASH(), FLAGS_UP_UV, reg.bindDigest(alice, qx, qy, 0));

        vm.prank(alice);
        uint256 g = gasleft();
        reg.bind(qx, qy, p);
        emit log_named_uint("bind gas (live precompile)", g - gasleft());

        assertEq(reg.reviewerOf(keccak256(abi.encode(qx, qy))), alice);
    }
}
