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
/** Public Monad RPCs cap `eth_getLogs` at about 100 blocks per call. */
const CHUNK = BigInt(process.env.LOG_CHUNK_BLOCKS ?? 100);
const PARALLEL = 8;
const TTL_MS = 15_000;

// The whole scan is one accumulator that only ever moves forward: the first request reads from the
// deploy block, every later one reads just the blocks since. Monad finalises in one slot, so there is
// no reorg to undo.
const data: Activity = { receipts: [], ratings: [], reviewers: new Map(), toBlock: -1n };
const liveByReviewer = new Map<string, RatingRow>();
let refreshedAt = 0;
let inflight: Promise<Activity> | undefined;

// ponytail: in-memory per server instance, so a cold start rescans from the deploy block (about 2,000
// calls per day of chain history at 100 blocks per call, 8 in parallel). Swap this module for Envio
// GraphQL once the deployment is old enough for that to hurt.
export function getActivity(chain: Chain): Promise<Activity> {
  if (Date.now() - refreshedAt < TTL_MS) return Promise.resolve(data);
  return (inflight ??= refresh(chain).finally(() => {
    inflight = undefined;
  }));
}

async function refresh({ client, deployment: d }: Chain): Promise<Activity> {
  const head = await client.getBlockNumber();
  const start = data.toBlock < 0n ? BigInt(d.deployedAtBlock) : data.toBlock + 1n;

  const ranges: [bigint, bigint][] = [];
  for (let from = start; from <= head; from += CHUNK) ranges.push([from, from + CHUNK - 1n < head ? from + CHUNK - 1n : head]);

  const address = [d.receiptRegistry, d.groundedReputation, d.reviewerRegistry];
  const scanned: Awaited<ReturnType<typeof client.getLogs>>[] = [];
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    scanned.push(
      ...(await Promise.all(ranges.slice(i, i + PARALLEL).map(([fromBlock, toBlock]) => client.getLogs({ address, fromBlock, toBlock })))),
    );
  }

  for (const log of parseEventLogs({ abi, logs: scanned.flat(), strict: false })) fold(log);
  data.toBlock = head;
  refreshedAt = Date.now();
  return data;
}

function fold(log: ReturnType<typeof parseEventLogs<typeof abi, false>>[number]) {
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
    const prev = liveByReviewer.get(key);
    if (prev) prev.live = false;
    liveByReviewer.set(key, row);
    data.ratings.push(row);
  } else if (log.eventName === "Swept") {
    const prev = liveByReviewer.get(`${log.args.agentId}:${log.args.reviewer}`);
    if (prev) prev.live = false;
  } else if (log.eventName === "ReviewerBound") {
    data.reviewers.set(log.args.reviewer!, { keyHash: log.args.keyHash!, tx: at.tx });
  }
}
