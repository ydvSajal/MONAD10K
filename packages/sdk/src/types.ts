import { z } from "zod";
import type { Address, PublicClient, WalletClient } from "viem";

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
  /** Total paid through the router, as a decimal string with 6 decimals. */
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
