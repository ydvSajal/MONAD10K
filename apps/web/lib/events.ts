import { groundedReputationAbi, receiptRegistryAbi, reviewerRegistryAbi } from "@grounded/sdk";
import { parseEventLogs, type Address, type Hex } from "viem";

import type { Chain } from "./grounded";

export interface ReceiptRow {
  id: bigint;
  agentId: bigint;
  payer: Address;
  /** Token base units. Only 6-decimal USDC is allowlisted on the router. */
  amount: bigint;
  tx: Hex;
  block: bigint;
}

export interface RatingRow {
  agentId: bigint;
  reviewer: Address;
  receiptId: bigint;
  feedbackIndex: bigint;
  score: number;
  weight: number;
  isDispute: boolean;
  /** False once a later rating by the same reviewer replaced it, or a sweep removed it. */
  live: boolean;
  tx: Hex;
  block: bigint;
}

export interface Activity {
  receipts: ReceiptRow[];
  ratings: RatingRow[];
  reviewers: Map<Address, { keyHash: Hex; tx: Hex }>;
  toBlock: bigint;
}

const abi = [...receiptRegistryAbi, ...groundedReputationAbi, ...reviewerRegistryAbi];
const CHUNK = BigInt(process.env.LOG_CHUNK_BLOCKS ?? 100);
const TTL_MS = 30_000;

let cache: { at: number; data: Activity } | undefined;

// ponytail: rescans every Grounded log from the deploy block, cached 30 s per server instance.
// Fine for a young deployment; swap this module for Envio GraphQL once testnet history grows.
export async function getActivity({ client, deployment: d }: Chain): Promise<Activity> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const toBlock = await client.getBlockNumber();
  const raw = [];
  for (let from = BigInt(d.deployedAtBlock); from <= toBlock; from += CHUNK) {
    const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
    raw.push(
      ...(await client.getLogs({
        address: [d.receiptRegistry, d.groundedReputation, d.reviewerRegistry],
        fromBlock: from,
        toBlock: to,
      })),
    );
  }

  const data: Activity = { receipts: [], ratings: [], reviewers: new Map(), toBlock };
  const liveKey = new Map<string, RatingRow>();
  for (const log of parseEventLogs({ abi, logs: raw, strict: false })) {
    const at = { tx: log.transactionHash!, block: log.blockNumber! };
    if (log.eventName === "ReceiptIssued") {
      const a = log.args;
      data.receipts.push({ id: a.id!, agentId: a.agentId!, payer: a.payer!, amount: a.amount!, ...at });
    } else if (log.eventName === "Grounded") {
      const a = log.args;
      const row: RatingRow = {
        agentId: a.agentId!,
        reviewer: a.reviewer!,
        receiptId: a.receiptId!,
        feedbackIndex: a.feedbackIndex!,
        score: a.score!,
        weight: a.weight!,
        isDispute: a.isDispute!,
        live: true,
        ...at,
      };
      const key = `${row.agentId}:${row.reviewer}`;
      const prev = liveKey.get(key);
      if (prev) prev.live = false;
      liveKey.set(key, row);
      data.ratings.push(row);
    } else if (log.eventName === "Swept") {
      const prev = liveKey.get(`${log.args.agentId}:${log.args.reviewer}`);
      if (prev) prev.live = false;
    } else if (log.eventName === "ReviewerBound") {
      data.reviewers.set(log.args.reviewer!, { keyHash: log.args.keyHash!, tx: at.tx });
    }
  }

  cache = { at: Date.now(), data };
  return data;
}
