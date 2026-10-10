import { erc8004ReputationAbi, groundedReputationAbi, receiptRegistryAbi, reviewerRegistryAbi } from "@sajalydv/grounded-sdk";
import { parseEventLogs, toEventSelector, type Address, type Hex } from "viem";

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
  /** ERC-8004 feedback that was revoked, as `agentId:client:feedbackIndex`. Ours only if a Grounded rating cites it. */
  revoked: Set<string>;
  toBlock: bigint;
}

const abi = [...receiptRegistryAbi, ...groundedReputationAbi, ...reviewerRegistryAbi, ...erc8004ReputationAbi];
// Only these events are fetched. The ERC-8004 registry is busy, and the topic filter keeps its NewFeedback out.
const WATCHED = new Set(["ReceiptIssued", "Grounded", "Swept", "ReviewerBound", "FeedbackRevoked"]);
const events = abi.filter((x) => x.type === "event" && WATCHED.has(x.name));
/** Public Monad RPCs cap `eth_getLogs` at about 100 blocks per call. */
const CHUNK = BigInt(process.env.LOG_CHUNK_BLOCKS ?? 100);
const PARALLEL = 8;
/** The public Monad RPC rejects more than 25 requests/s ("requests limited to 25/sec"); stay under it. */
const MAX_RPS = 20;
const TTL_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getLogs(client: Chain["client"], args: Parameters<Chain["client"]["getLogs"]>[0]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.getLogs(args);
    } catch (e) {
      // Rate limits (another instance scanning) and timeouts (the public RPC stalls) are transient: back off and retry.
      if (attempt >= 4 || !/limited|rate|429|timed? ?out|took too long/i.test(String(e))) throw e;
      await sleep(500 * 2 ** attempt);
    }
  }
}

/** Etherscan V2 (free tier covers Monad testnet) serves getLogs over any block range: 4 calls instead of one per 100 blocks. */
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_PAGE = 1000;
/** Free tier allows 3 calls/s per key; space every call, across concurrent refreshes too. */
let nextCallAt = 0;
async function throttle() {
  const wait = nextCallAt - Date.now();
  nextCallAt = Math.max(Date.now(), nextCallAt) + 400;
  if (wait > 0) await sleep(wait);
}

interface ExplorerLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

// ponytail: Etherscan caps page × offset at 10,000, so one contract tops out at 10k logs per refresh window.
// Past that, advance fromBlock by the last block seen instead of paging.
async function explorerLogs(address: Address, from: bigint, to: bigint, topic0?: Hex): Promise<ExplorerLog[]> {
  const out: ExplorerLog[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      chainid: "10143",
      module: "logs",
      action: "getLogs",
      address,
      fromBlock: String(from),
      toBlock: String(to),
      page: String(page),
      offset: String(ETHERSCAN_PAGE),
      apikey: ETHERSCAN_KEY!,
      ...(topic0 ? { topic0 } : {}),
    });
    let body: { status: string; message: string; result: unknown } | undefined;
    for (let attempt = 0; ; attempt++) {
      await throttle();
      body = await (await fetch(`https://api.etherscan.io/v2/api?${q}`, { cache: "no-store" })).json();
      // Free tier is 5 calls/s; "Max calls per sec" is transient.
      if (attempt >= 4 || typeof body!.result !== "string" || !/rate limit|max calls/i.test(body!.result)) break;
      await sleep(500 * 2 ** attempt);
    }
    if (body!.status !== "1") {
      if (/no records/i.test(body!.message)) return out;
      throw new Error(`etherscan getLogs ${address}: ${String(body!.result)}`);
    }
    const rows = body!.result as { address: Address; topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex }[];
    for (const r of rows) {
      out.push({ ...r, topics: r.topics.filter(Boolean), blockNumber: BigInt(r.blockNumber), logIndex: r.logIndex === "0x" ? 0 : Number(r.logIndex) });
    }
    if (rows.length < ETHERSCAN_PAGE) return out;
  }
}

// The whole scan is one accumulator that only ever moves forward: the first request reads from the
// deploy block, every later one reads just the blocks since. Monad finalises in one slot, so there is
// no reorg to undo.
const data: Activity = { receipts: [], ratings: [], reviewers: new Map(), revoked: new Set(), toBlock: -1n };
const liveByReviewer = new Map<string, RatingRow>();
let refreshedAt = 0;
let inflight: Promise<Activity> | undefined;

// ponytail: in-memory per server instance, so a cold start rescans from the deploy block (about 2,000
// calls per day of chain history at 100 blocks per call, paced to 20/s = ~100 s per day of history).
// Swap this module for Envio GraphQL, or an RPC with a wider getLogs range, before that outgrows the
// function timeout.
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

  const address = [d.receiptRegistry, d.groundedReputation, d.reviewerRegistry, d.erc8004Reputation];
  if (ETHERSCAN_KEY) {
    const ours: ExplorerLog[][] = [];
    for (const a of address.slice(0, 3)) ours.push(await explorerLogs(a, start, head));
    const revoked = await explorerLogs(d.erc8004Reputation, start, head, toEventSelector(events.find((e) => e.name === "FeedbackRevoked")!));
    const logs = [...ours.flat(), ...revoked].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
    for (const log of parseEventLogs({ abi, logs: logs as never, strict: false })) fold(log);
    data.toBlock = head;
    refreshedAt = Date.now();
    return data;
  }
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const started = Date.now();
    const batch = ranges.slice(i, i + PARALLEL);
    const logs = await Promise.all(batch.map(([fromBlock, toBlock]) => getLogs(client, { address, events: events as never, fromBlock, toBlock })));
    // Fold and advance per batch, so a failure mid-scan keeps the progress and the next request resumes from here.
    for (const log of parseEventLogs({ abi, logs: logs.flat(), strict: false })) fold(log);
    data.toBlock = batch[batch.length - 1]![1];
    // Pace batches so PARALLEL calls never exceed MAX_RPS.
    if (i + PARALLEL < ranges.length) await sleep(Math.max(0, (PARALLEL * 1000) / MAX_RPS - (Date.now() - started)));
  }

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
  } else if (log.eventName === "FeedbackRevoked") {
    const a = log.args;
    data.revoked.add(`${a.agentId}:${a.clientAddress!.toLowerCase()}:${a.feedbackIndex}`);
  }
}
