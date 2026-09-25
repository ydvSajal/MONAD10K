import { z } from "zod";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { Authenticator } from "./authenticator.js";

export type ChainName = "monad-testnet";

export interface Addresses {
  groundedReputation: Address;
  receiptRouter: Address;
  receiptRegistry: Address;
  reviewerRegistry: Address;
  erc8004Identity: Address;
  erc8004Reputation: Address;
  usdc: Address;
}

export interface GroundedConfig {
  chain: ChainName;
  rpcUrl?: string;
  /** Tried when `rpcUrl` fails or is rate limited, e.g. an Alchemy or QuickNode Monad testnet URL. */
  fallbackRpcUrl?: string;
  indexerUrl?: string;
  /** Required for writes. */
  walletClient?: WalletClient;
  /** Override for a local anvil fork, or before the testnet addresses are published. */
  addresses?: Partial<Addresses>;
  /** Supply your own client instead of letting the SDK build one from `rpcUrl`. */
  publicClient?: PublicClient;
}

/**
 * `none` means nobody has rated this agent, so the 0 score carries no information at all —
 * treat it as unknown, never as bad. `low` means fewer than five reviewers.
 */
export type Confidence = "none" | "low" | "ok";

export interface ScoreResult {
  agentId: bigint;
  /** Weighted median of grounded ratings, 0..100. */
  score: number;
  /** ERC-8004's own average over the same tag, ungrounded. `null` when it cannot be read. */
  rawScore: number | null;
  reviewers: number;
  receipts: number;
  /** Paid in the receipts behind grounded ratings, as a decimal string with 6 decimals. */
  paid: string;
  confidence: Confidence;
  updatedAt: Date | null;
  ownerChangedAt: Date | null;
  disputes: number;
}

export interface TrustPolicy {
  minScore: number;
  minReviewers: number;
  /** Reject an agent whose owner changed after its ratings were earned. */
  ratingsAfterOwnerChange?: boolean;
}

export interface CheckResult {
  pass: boolean;
  /** Empty when `pass`; otherwise one human-readable line per failed condition. */
  reasons: string[];
  score: ScoreResult;
}

export const agentIdSchema = z.coerce.bigint().nonnegative();

export const trustPolicySchema = z.object({
  minScore: z.number().int().min(0).max(100),
  minReviewers: z.number().int().min(0),
  ratingsAfterOwnerChange: z.boolean().optional(),
});

export type PayMode = "transfer" | "authorization";
export type RatingTag = "quality" | "dispute";

export interface PayArgs {
  agentId: bigint | number | string;
  /** Decimal amount in token units, e.g. "0.05". The router's floor is 0.01 USDC. */
  amount: string;
  /** Defaults to Monad testnet USDC. */
  token?: Address;
  /**
   * `transfer` approves the router and calls `pay` (two transactions the first time).
   * `authorization` signs an EIP-3009 `ReceiveWithAuthorization` to the router and calls
   * `payWithAuthorization` (one). Only the router can redeem it, and only for this agent.
   */
  mode?: PayMode;
}

/** How `withTrust` pays. The seller names the price, so the buyer names a ceiling. */
export interface PayOptions {
  /** Most the buyer will pay per request, as a decimal in token units, e.g. "0.10". Required. */
  maxAmount: string;
  mode?: PayMode;
}

export const payOptionsSchema = z.object({
  maxAmount: z.string().regex(/^\d+(\.\d+)?$/, "maxAmount must be a plain decimal string like 0.10"),
  mode: z.enum(["transfer", "authorization"]).default("transfer"),
});

export interface PayResult {
  receiptId: bigint;
  txHash: Hex;
}

/** Decimal token units, at or above the router's 0.01 floor (`MIN_AMOUNT_6DP`). */
export const amountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "amount must be a plain decimal string like 0.05")
  .refine((a) => Number(a) >= 0.01, "amount must be at least 0.01, the router's floor");

export const payArgsSchema = z.object({
  agentId: agentIdSchema,
  amount: amountSchema,
  token: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  mode: z.enum(["transfer", "authorization"]).default("transfer"),
});

/**
 * Capped at a day. The deadline is encoded as uint40 only after the feedback is posted, so an
 * out-of-range value must fail here, before anything public happens.
 */
export const deadlineSchema = z.object({
  deadlineSec: z.number().int().positive().max(86_400).default(600),
});

export const ratingSchema = deadlineSchema.extend({
  receiptId: z.coerce.bigint().positive(),
  score: z.number().int().min(0).max(100),
  tag: z.enum(["quality", "dispute"]).default("quality"),
});

export interface RateArgs {
  /** A receipt from `pay`, paid by this wallet and not yet used. */
  receiptId: bigint | number | string;
  /** 0..100, integer. */
  score: number;
  /** `dispute` is counted separately and never moves the score. Default `quality`. */
  tag?: RatingTag;
  authenticator: Authenticator;
  /** How long the passkey signature stays valid, from the current block. Default 600. */
  deadlineSec?: number;
}

export interface RateResult {
  feedbackTx: Hex;
  groundTx: Hex;
  feedbackIndex: bigint;
}
