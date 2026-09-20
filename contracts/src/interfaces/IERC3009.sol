// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice EIP-3009 transfer with authorization, as implemented by Circle USDC.
/// @dev Monad testnet USDC 0x534b2f3A21130d7a60830c2Df862319e593943A3 exposes this
///      (EIP-712 domain name "USDC", version "2" — verified on chain).
interface IERC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
