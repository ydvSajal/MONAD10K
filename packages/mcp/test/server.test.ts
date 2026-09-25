import { readFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Grounded, type ScoreResult } from "@grounded/sdk";
import { describe, expect, it } from "vitest";

import { createServer, type Reader } from "../src/server.js";

async function connect(reader: Reader) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await createServer(reader).connect(serverSide);
  await client.connect(clientSide);
  return client;
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "") as string;

const score = (over: Partial<ScoreResult> = {}): ScoreResult => ({
  agentId: 7n,
  score: 20,
  rawScore: 87,
  reviewers: 2,
  receipts: 2,
  paid: "0.2",
  confidence: "low",
  updatedAt: new Date("2026-09-26T00:00:00Z"),
  ownerChangedAt: null,
  disputes: 0,
  ...over,
});

describe("grounded MCP server (fake reader)", () => {
  it("exposes exactly the two read-only tools", async () => {
    const client = await connect({ score: async () => score(), check: async () => ({ pass: true, reasons: [], score: score() }) });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["grounded_check", "grounded_score"]);
  });

  it("returns the score as JSON, with bigint and Date serialised", async () => {
    const seen: string[] = [];
    const client = await connect({
      score: async (id) => (seen.push(String(id)), score()),
      check: async () => ({ pass: true, reasons: [], score: score() }),
    });
    const res = await client.callTool({ name: "grounded_score", arguments: { agentId: 7 } }); // a number, as models send
    const body = JSON.parse(text(res));
    expect(seen).toEqual(["7"]);
    expect(body).toMatchObject({ agentId: "7", score: 20, rawScore: 87, confidence: "low" });
    expect(body.updatedAt).toBe("2026-09-26T00:00:00.000Z");
  });

  it("passes the policy through to check and reports every reason", async () => {
    let got: unknown;
    const client = await connect({
      score: async () => score(),
      check: async (_id, policy) => (
        (got = policy),
        { pass: false, reasons: ["2 reviewers, policy wants 3", "score 20, policy wants 70"], score: score() }
      ),
    });
    const res = await client.callTool({ name: "grounded_check", arguments: { agentId: "7", minScore: 70, minReviewers: 3 } });
    expect(got).toEqual({ minScore: 70, minReviewers: 3 });
    const body = JSON.parse(text(res));
    expect(body.pass).toBe(false);
    expect(body.reasons).toHaveLength(2);
  });

  it("rejects bad input before it reaches the reader", async () => {
    let called = false;
    const client = await connect({
      score: async () => ((called = true), score()),
      check: async () => ({ pass: true, reasons: [], score: score() }),
    });
    for (const args of [{ agentId: "abc" }, { agentId: "-1" }, { agentId: "1".repeat(100) }]) {
      const res = (await client.callTool({ name: "grounded_score", arguments: args })) as { isError?: boolean };
      expect(res.isError).toBe(true);
    }
    const bad = (await client.callTool({ name: "grounded_check", arguments: { agentId: "1", minScore: 101, minReviewers: 0 } })) as { isError?: boolean };
    expect(bad.isError).toBe(true);
    expect(called).toBe(false);
  });

  it("turns a reader failure into an error result instead of crashing", async () => {
    const client = await connect({
      score: async () => {
        throw new Error("rpc down");
      },
      check: async () => ({ pass: true, reasons: [], score: score() }),
    });
    const res = (await client.callTool({ name: "grounded_score", arguments: { agentId: "1" } })) as { isError?: boolean };
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("rpc down");
  });
});

// Against a real deployment, e.g. an anvil fork seeded by `pnpm --filter @grounded/seed start`.
// GROUNDED_TEST_RPC=http://127.0.0.1:8545 GROUNDED_TEST_ADDRESSES=../../deployments/10143.json GROUNDED_TEST_AGENT=<id>
const rpcUrl = process.env.GROUNDED_TEST_RPC;
const addressesPath = process.env.GROUNDED_TEST_ADDRESSES;
const agent = process.env.GROUNDED_TEST_AGENT;

describe.skipIf(!rpcUrl || !addressesPath || !agent)("grounded MCP server (forked chain)", () => {
  it("answers from the real contracts", async () => {
    const g = new Grounded({ chain: "monad-testnet", rpcUrl: rpcUrl!, addresses: JSON.parse(readFileSync(addressesPath!, "utf8")) });
    const client = await connect(g);
    const res = await client.callTool({ name: "grounded_check", arguments: { agentId: agent!, minScore: 70, minReviewers: 3 } });
    const body = JSON.parse(text(res));
    expect(body.score.agentId).toBe(agent);
    expect(typeof body.pass).toBe("boolean");
    expect(Array.isArray(body.reasons)).toBe(true);
    // The seeded Sybil agent: a high raw score next to a low grounded one.
    if (process.env.GROUNDED_TEST_EXPECT_GAP) expect(body.score.rawScore - body.score.score).toBeGreaterThan(20);
  });
});
