import type { Address } from "viem";

/** `GigEscrow` on Monad testnet (4 Nov 2026, block 76891053). `NEXT_PUBLIC_GIG_ESCROW` overrides it for a redeploy. */
export const GIG_ESCROW = (process.env.NEXT_PUBLIC_GIG_ESCROW ??
  "0x5928c1a02BC3937aBe7cd5b5E39031507eC535c8") as Address;

export const gigEscrowAbi = [
  {
    type: "function",
    name: "hire",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "amount", type: "uint96" },
      { name: "minScore", type: "uint8" },
      { name: "minReviewers", type: "uint32" },
      { name: "deadline", type: "uint40" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  {
    type: "function",
    name: "feeOf",
    stateMutability: "pure",
    inputs: [{ name: "amount", type: "uint96" }],
    outputs: [{ name: "", type: "uint96" }],
  },
  {
    type: "event",
    name: "JobHired",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "amount", type: "uint96", indexed: false },
      { name: "fee", type: "uint96", indexed: false },
      { name: "deadline", type: "uint40", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobReleased",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "receiptId", type: "uint256", indexed: true },
    ],
  },
  { type: "error", name: "AgentNotTrusted", inputs: [{ name: "agentId", type: "uint256" }] },
  { type: "error", name: "NoAgentWallet", inputs: [{ name: "agentId", type: "uint256" }] },
  { type: "error", name: "AmountBelowMinimum", inputs: [{ name: "amount", type: "uint96" }] },
  { type: "error", name: "BadDeadline", inputs: [{ name: "deadline", type: "uint40" }] },
  { type: "error", name: "BadStatus", inputs: [{ name: "status", type: "uint8" }] },
  { type: "error", name: "NotClient", inputs: [{ name: "caller", type: "address" }] },
  { type: "error", name: "TooEarly", inputs: [{ name: "deadline", type: "uint40" }] },
] as const;
