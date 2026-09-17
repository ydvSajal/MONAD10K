// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ReceiptRegistry} from "./ReceiptRegistry.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {Receipt, ReceiptStatus} from "./types/GroundedTypes.sol";

/// @title ReceiptRouter
/// @notice Non-custodial payment path: payer -> agent wallet, in one call, with a receipt.
/// @dev Holds no balance, ever (invariant test). Token allowlist and decimals are fixed at
///      construction; there is no setter and no owner.
contract ReceiptRouter {
    using SafeERC20 for IERC20;

    /// @notice Dust floor, normalised to 6 decimals: 0.01 USDC.
    uint256 public constant MIN_AMOUNT_6DP = 10_000;

    IIdentityRegistry public immutable identity;
    ReceiptRegistry public immutable receipts;

    mapping(address token => bool) public allowed;
    mapping(address token => uint8) public decimalsOf;

    error TokenNotAllowed(address token);
    error AmountBelowMinimum(uint256 normalised6dp);
    error AmountTooLarge(uint256 value);
    error NoAgentWallet(uint256 agentId);
    error BadSignatureLength(uint256 length);
    error NoTokens();

    constructor(IIdentityRegistry identity_, ReceiptRegistry receipts_, address[] memory tokens_) {
        if (tokens_.length == 0) revert NoTokens();
        identity = identity_;
        receipts = receipts_;
        for (uint256 i = 0; i < tokens_.length; ++i) {
            address t = tokens_[i];
            allowed[t] = true;
            decimalsOf[t] = IERC20Metadata(t).decimals();
        }
    }

    /// @notice Pay `agentId` and get a receipt. Payer is `msg.sender`.
    function pay(uint256 agentId, address token, uint256 value) external returns (uint256 receiptId) {
        address to = _check(agentId, token, value);
        IERC20(token).safeTransferFrom(msg.sender, to, value);
        return _issue(agentId, msg.sender, token, value);
    }

    /// @notice Pay with an EIP-3009 authorization signed by `from`; anyone may relay it.
    /// @dev `from` signed `to`, so a wrong recipient reverts inside the token. The receipt's
    ///      payer is `from`, never the relayer.
    function payWithAuthorization(
        uint256 agentId,
        address token,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external returns (uint256 receiptId) {
        address to = _check(agentId, token, value);
        if (signature.length != 65) revert BadSignatureLength(signature.length);
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        IERC3009(token).transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s);
        return _issue(agentId, from, token, value);
    }

    /// @notice Token base units expressed with 6 decimals. Used for the floor, weights and totals.
    function normalize(address token, uint256 value) public view returns (uint256) {
        uint8 d = decimalsOf[token];
        if (d > 6) return value / (10 ** (d - 6));
        if (d < 6) return value * (10 ** (6 - d));
        return value;
    }

    function _check(uint256 agentId, address token, uint256 value) private view returns (address to) {
        if (!allowed[token]) revert TokenNotAllowed(token);
        uint256 normalised = normalize(token, value);
        if (normalised < MIN_AMOUNT_6DP) revert AmountBelowMinimum(normalised);
        if (value > type(uint96).max) revert AmountTooLarge(value);
        to = identity.getAgentWallet(agentId);
        if (to == address(0)) revert NoAgentWallet(agentId);
    }

    function _issue(uint256 agentId, address payer, address token, uint256 value) private returns (uint256) {
        return receipts.issue(
            Receipt({
                agentId: agentId,
                payer: payer,
                token: token,
                // casting to 'uint96' is safe because _check() rejects value > type(uint96).max
                // forge-lint: disable-next-line(unsafe-typecast)
                amount: uint96(value),
                // casting to 'uint40' is safe until year 36812
                // forge-lint: disable-next-line(unsafe-typecast)
                paidAt: uint40(block.timestamp),
                status: ReceiptStatus.Issued
            })
        );
    }
}
