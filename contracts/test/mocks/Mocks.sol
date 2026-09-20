// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _decimals = d;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev EIP-3009 subset: verifies nothing about the signature except that it is the one
///      this mock was told to expect. Real signature behaviour is covered by the fork test.
contract MockERC3009 is MockERC20 {
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    error AuthorizationUsed();
    error AuthorizationExpired();

    constructor(uint8 d) MockERC20("Mock3009", "M3009", d) {}

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8,
        bytes32,
        bytes32
    ) external {
        if (authorizationState[from][nonce]) revert AuthorizationUsed();
        if (block.timestamp <= validAfter || block.timestamp >= validBefore) revert AuthorizationExpired();
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public wallets;
    mapping(uint256 => address) public approvals;
    mapping(address => mapping(address => bool)) public operators;

    function setAgent(uint256 agentId, address owner_, address wallet_) external {
        owners[agentId] = owner_;
        wallets[agentId] = wallet_;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return owners[agentId];
    }

    function getApproved(uint256 agentId) external view returns (address) {
        return approvals[agentId];
    }

    function isApprovedForAll(address owner_, address operator) external view returns (bool) {
        return operators[owner_][operator];
    }

    /// @dev Mirrors the live registry: falls back to the owner when no wallet is set.
    function getAgentWallet(uint256 agentId) external view returns (address) {
        address w = wallets[agentId];
        return w == address(0) ? owners[agentId] : w;
    }
}
