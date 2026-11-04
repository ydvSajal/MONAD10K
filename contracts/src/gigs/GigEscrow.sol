// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ReceiptRouter} from "../ReceiptRouter.sol";
import {IGroundedReputation} from "../interfaces/IGroundedReputation.sol";

/// @title GigEscrow
/// @notice Hire a freelancer or agent by ERC-8004 id. The contract itself refuses anyone whose grounded
///         score misses the client's bar, so free fake reviews cannot win a job.
/// @dev No owner, admin, pauser or proxy.
///      ponytail: no disputes. The client alone releases, and can take the money back after the deadline,
///      so a freelancer trusts the client to pay. An arbiter would need a role this contract refuses to have.
contract GigEscrow {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Hired,
        Released,
        Refunded
    }

    struct Job {
        address client;
        uint96 amount;
        uint256 agentId;
        uint40 deadline;
        Status status;
    }

    uint256 public constant FEE_BPS = 500;
    /// @dev The router's dust floor. Checked at hire so the money cannot get stuck until the deadline.
    uint96 public constant MIN_AMOUNT = 10_000;

    IERC20 public immutable usdc;
    ReceiptRouter public immutable router;
    IGroundedReputation public immutable grounded;
    address public immutable feeRecipient;

    uint256 public jobCount;
    mapping(uint256 jobId => Job) public jobs;

    event JobHired(
        uint256 indexed jobId,
        address indexed client,
        uint256 indexed agentId,
        uint96 amount,
        uint96 fee,
        uint40 deadline
    );
    event JobReleased(uint256 indexed jobId, uint256 indexed receiptId);
    event JobRefunded(uint256 indexed jobId);

    error AgentNotTrusted(uint256 agentId);
    error NoAgentWallet(uint256 agentId);
    error AmountBelowMinimum(uint96 amount);
    error BadDeadline(uint40 deadline);
    error BadStatus(Status status);
    error NotClient(address caller);
    error TooEarly(uint40 deadline);

    constructor(IERC20 usdc_, ReceiptRouter router_, IGroundedReputation grounded_, address feeRecipient_) {
        usdc = usdc_;
        router = router_;
        grounded = grounded_;
        feeRecipient = feeRecipient_;
    }

    function feeOf(uint96 amount) public pure returns (uint96) {
        // casting to 'uint96' is safe because the result is 5% of a uint96
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint96((uint256(amount) * FEE_BPS) / 10_000);
    }

    /// @notice Lock `amount` plus the fee for `agentId`. Reverts `AgentNotTrusted` below the client's bar.
    function hire(uint256 agentId, uint96 amount, uint8 minScore, uint32 minReviewers, uint40 deadline)
        external
        returns (uint256 jobId)
    {
        if (!grounded.meets(agentId, minScore, minReviewers)) revert AgentNotTrusted(agentId);
        if (router.identity().getAgentWallet(agentId) == address(0)) revert NoAgentWallet(agentId);
        if (amount < MIN_AMOUNT) revert AmountBelowMinimum(amount);
        if (deadline <= block.timestamp) revert BadDeadline(deadline);

        jobId = ++jobCount;
        jobs[jobId] = Job(msg.sender, amount, agentId, deadline, Status.Hired);
        uint96 fee = feeOf(amount);
        emit JobHired(jobId, msg.sender, agentId, amount, fee, deadline);
        usdc.safeTransferFrom(msg.sender, address(this), uint256(amount) + fee);
    }

    /// @notice Pay the freelancer, with a Grounded receipt that names the client as payer, so the client
    ///         can rate them.
    /// @dev The router records the signer of an EIP-3009 authorization as payer, so the escrow hands the
    ///      amount back to the client and the router pulls it onward in this same transaction. If that
    ///      pull fails, everything reverts, so the client cannot walk away with the money. The signature
    ///      names the router as payee, with nonce `router.authorizationNonce(agentId, salt)`.
    function release(uint256 jobId, uint256 validAfter, uint256 validBefore, bytes32 salt, bytes calldata signature)
        external
        returns (uint256 receiptId)
    {
        Job storage job = jobs[jobId];
        if (job.status != Status.Hired) revert BadStatus(job.status);
        if (msg.sender != job.client) revert NotClient(msg.sender);
        job.status = Status.Released;

        usdc.safeTransfer(feeRecipient, feeOf(job.amount));
        usdc.safeTransfer(job.client, job.amount);
        receiptId = router.payWithAuthorization(
            job.agentId, address(usdc), job.client, job.amount, validAfter, validBefore, salt, signature
        );
        emit JobReleased(jobId, receiptId);
    }

    /// @notice Client takes back the amount and fee once the deadline has passed.
    function refund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.status != Status.Hired) revert BadStatus(job.status);
        if (msg.sender != job.client) revert NotClient(msg.sender);
        if (block.timestamp <= job.deadline) revert TooEarly(job.deadline);
        job.status = Status.Refunded;

        emit JobRefunded(jobId);
        usdc.safeTransfer(job.client, uint256(job.amount) + feeOf(job.amount));
    }
}
