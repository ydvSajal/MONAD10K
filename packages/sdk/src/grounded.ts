import { createPublicClient, formatUnits, http } from "viem";
import type { Address, PublicClient } from "viem";

import { erc8004IdentityAbi, erc8004ReputationAbi, groundedReputationAbi } from "./abi.js";
import { chains, knownAddresses } from "./chain.js";
import { NotDeployedError, UntrustedAgentError } from "./errors.js";
import {
  agentIdSchema,
  trustPolicySchema,
  type Addresses,
  type CheckResult,
  type Confidence,
  type GroundedConfig,
  type ScoreResult,
  type TrustPolicy,
} from "./types.js";

/** Below this many live reviewers the score is reported as low confidence (TRD §4). */
const MIN_REVIEWERS_OK = 5;
/** Grounded's fixed rating tag. Anything else is not a score. */
const TAG_QUALITY = "quality";

export class Grounded {
  readonly publicClient: PublicClient;
  private readonly addresses: Partial<Addresses>;

  constructor(private readonly config: GroundedConfig) {
    const chain = chains[config.chain];
    this.publicClient =
      config.publicClient ??
      (createPublicClient({
        chain,
        transport: http(config.rpcUrl ?? chain.rpcUrls.default.http[0]),
      }) as PublicClient);
    this.addresses = { ...knownAddresses[config.chain], ...config.addresses };
  }

  private address(name: keyof Addresses): Address {
    const a = this.addresses[name];
    if (!a) throw new NotDeployedError(name);
    return a;
  }

  /**
   * The grounded score, read straight from the contract. Nothing here is recomputed off chain: the
   * median comes from `scoreOf`, so an indexer being down or wrong cannot change the answer.
   */
  async score(agentIdInput: bigint | number | string): Promise<ScoreResult> {
    const agentId = agentIdSchema.parse(agentIdInput);
    const grounded = this.address("groundedReputation");

    const [score, disputes] = await Promise.all([
      this.publicClient.readContract({
        address: grounded,
        abi: groundedReputationAbi,
        functionName: "scoreOf",
        args: [agentId],
      }),
      this.publicClient.readContract({
        address: grounded,
        abi: groundedReputationAbi,
        functionName: "disputeCount",
        args: [agentId],
      }),
    ]);

    const reviewers = Number(score.reviewers);

    return {
      agentId,
      score: Number(score.median),
      rawScore: await this.rawScore(agentId),
      reviewers,
      receipts: Number(score.receipts),
      paid: formatUnits(score.paid, 6),
      confidence: confidenceOf(reviewers),
      updatedAt: toDate(score.updatedAt),
      ownerChangedAt: toDate(score.ownerChangedAt),
      disputes: Number(disputes),
    };
  }

  /**
   * ERC-8004's own average for the same tag: every rating, paid or not. This is the number Grounded
   * exists to contrast with, so the explorer can show them side by side.
   *
   * Returns null instead of throwing, because it is a comparison figure and the registry's
   * `getClients` is unbounded — a popular agent can make this call too large to serve.
   */
  async rawScore(agentId: bigint): Promise<number | null> {
    try {
      const reputation = this.address("erc8004Reputation");
      const clients = await this.publicClient.readContract({
        address: reputation,
        abi: erc8004ReputationAbi,
        functionName: "getClients",
        args: [agentId],
      });
      if (clients.length === 0) return null;

      const [count, summaryValue, decimals] = await this.publicClient.readContract({
        address: reputation,
        abi: erc8004ReputationAbi,
        functionName: "getSummary",
        args: [agentId, clients, TAG_QUALITY, ""],
      });
      if (count === 0n) return null;

      return Number(summaryValue) / 10 ** Number(decimals);
    } catch {
      return null;
    }
  }

  /**
   * Evaluate an agent against a policy. Every failed condition is reported, not just the first, so
   * a caller can tell "too new" apart from "actually bad" — they are very different decisions.
   */
  async check(agentIdInput: bigint | number | string, policy: TrustPolicy): Promise<CheckResult> {
    const p = trustPolicySchema.parse(policy);
    const score = await this.score(agentIdInput);
    const reasons: string[] = [];

    if (score.confidence === "none") {
      reasons.push("no grounded ratings yet — unrated, which is not the same as bad");
    }
    if (score.reviewers < p.minReviewers) {
      reasons.push(`${score.reviewers} reviewers, policy wants ${p.minReviewers}`);
    }
    if (score.score < p.minScore) {
      reasons.push(`score ${score.score}, policy wants ${p.minScore}`);
    }
    if (p.ratingsAfterOwnerChange === false && score.ownerChangedAt) {
      reasons.push(
        `agent changed owner at ${score.ownerChangedAt.toISOString()} and the policy does not ` +
          `accept ratings earned before a transfer`,
      );
    }

    return { pass: reasons.length === 0, reasons, score };
  }

  /** `check`, but it throws. For the common "refuse to deal with this agent" path. */
  async assertTrusted(agentIdInput: bigint | number | string, policy: TrustPolicy): Promise<ScoreResult> {
    const result = await this.check(agentIdInput, policy);
    if (!result.pass) throw new UntrustedAgentError(result.score.agentId, result.reasons);
    return result.score;
  }

  /** Where a payment to this agent would land. Zero means the agent cannot be paid at all. */
  async payoutWallet(agentIdInput: bigint | number | string): Promise<Address | null> {
    const agentId = agentIdSchema.parse(agentIdInput);
    const wallet = await this.publicClient.readContract({
      address: this.address("erc8004Identity"),
      abi: erc8004IdentityAbi,
      functionName: "getAgentWallet",
      args: [agentId],
    });
    return wallet === "0x0000000000000000000000000000000000000000" ? null : wallet;
  }
}

function confidenceOf(reviewers: number): Confidence {
  if (reviewers === 0) return "none";
  return reviewers < MIN_REVIEWERS_OK ? "low" : "ok";
}

function toDate(timestamp: bigint | number): Date | null {
  const t = Number(timestamp);
  return t === 0 ? null : new Date(t * 1000);
}
