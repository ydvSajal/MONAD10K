import { describe, expect, it, vi } from "vitest";
import { createWalletClient, http } from "viem";
import type { Address, PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { Grounded } from "../src/grounded.js";
import { groundedPaywall, memoryReceiptStore } from "../src/server.js";
import { encodeAccess, RECEIPT_HEADER, type PaymentRequired } from "../src/x402.js";
import { GroundedError, UntrustedAgentError } from "../src/errors.js";
import { monadTestnet } from "../src/chain.js";
import type { ScoreResult } from "../src/types.js";

const addresses = {
  groundedReputation: "0x1000000000000000000000000000000000000001",
  receiptRouter: "0x1000000000000000000000000000000000000002",
  receiptRegistry: "0x1000000000000000000000000000000000000003",
  reviewerRegistry: "0x1000000000000000000000000000000000000004",
} as const;

/** Just enough chain for everything that happens before a payment: chain id and USDC decimals. */
const publicClient = {
  getChainId: async () => 10143,
  readContract: async () => 6,
} as unknown as PublicClient;

function client(withWallet = false) {
  const walletClient = withWallet
    ? createWalletClient({ chain: monadTestnet, transport: http(), account: privateKeyToAccount(generatePrivateKey()) })
    : undefined;
  return new Grounded({ chain: "monad-testnet", publicClient, addresses, ...(walletClient ? { walletClient } : {}) });
}

const unrated: ScoreResult = {
  agentId: 7n,
  score: 0,
  rawScore: null,
  reviewers: 0,
  receipts: 0,
  paid: "0",
  confidence: "none",
  updatedAt: null,
  ownerChangedAt: null,
  disputes: 0,
};

function paywall() {
  const mw = groundedPaywall({ grounded: client(), agentId: 7n, price: "0.05", store: memoryReceiptStore() });
  return async (req: Request) => (await mw({ req: { raw: req } }, async () => {})) ?? new Response("ok");
}

describe("groundedPaywall", () => {
  it("answers an unpaid request with a 402 that points at the router, not the agent", async () => {
    const res = await paywall()(new Request("https://seller.test/summarise"));
    const body = (await res.json()) as PaymentRequired;

    expect(res.status).toBe(402);
    expect(body.accepts[0]).toMatchObject({
      scheme: "grounded-router",
      network: "eip155:10143",
      amount: "50000",
      payTo: addresses.receiptRouter,
      extra: { agentId: "7", receiptRegistry: addresses.receiptRegistry },
    });
  });

  it.each([
    ["garbage", "not base64 json", "malformed"],
    ["a stale signature", { iat: Math.floor(Date.now() / 1000) - 600 }, "expired"],
    ["another route", { url: "https://seller.test/other" }, "different request"],
    ["another method", { method: "POST" }, "different request"],
  ])("refuses a header for %s before touching the chain", async (_, patch, error) => {
    const header =
      typeof patch === "string"
        ? patch
        : encodeAccess({
            receiptId: 1n,
            payer: "0x2000000000000000000000000000000000000002" as Address,
            url: "https://seller.test/summarise",
            method: "GET",
            iat: Math.floor(Date.now() / 1000),
            sig: "0x1234",
            ...patch,
          });
    const res = await paywall()(new Request("https://seller.test/summarise", { headers: { [RECEIPT_HEADER]: header } }));

    expect(res.status).toBe(402);
    expect(((await res.json()) as PaymentRequired).error).toContain(error);
  });
});

describe("groundedPaywall config", () => {
  it("refuses a price under the router's floor at construction, not after buyers pay", () => {
    expect(() =>
      groundedPaywall({ grounded: client(), agentId: 7n, price: "0.001", store: memoryReceiptStore() }),
    ).toThrow(/router's floor/);
  });

  it("recovers from an RPC failure on the first request", async () => {
    let calls = 0;
    const flaky = {
      getChainId: async () => {
        if (calls++ === 0) throw new Error("rpc down");
        return 10143;
      },
      readContract: async () => 6,
    } as unknown as PublicClient;
    const grounded = new Grounded({ chain: "monad-testnet", publicClient: flaky, addresses });
    const mw = groundedPaywall({ grounded, agentId: 7n, price: "0.05", store: memoryReceiptStore() });
    const run = () => mw({ req: { raw: new Request("https://seller.test/") } }, async () => {});

    await expect(run()).rejects.toThrow("rpc down");
    expect((await run())?.status).toBe(402);
  });
});

describe("withTrust", () => {
  it("retries a one-shot streamed body intact after paying", async () => {
    const g = client(true);
    vi.spyOn(g, "score").mockResolvedValue(unrated);
    vi.spyOn(g as never, "payValue").mockResolvedValue({ receiptId: 1n, txHash: "0x" } as never);
    const offer = await (await paywall()(new Request("https://seller.test/summarise"))).json();
    const seen: string[] = [];
    const f = g.withTrust(
      async (i) => {
        const req = i as Request;
        seen.push(await req.text());
        return req.headers.has(RECEIPT_HEADER) ? new Response("ok") : Response.json(offer, { status: 402 });
      },
      { minScore: 0, minReviewers: 0, maxAmount: "1" },
    );
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("summarise this"));
        c.close();
      },
    });

    const res = await f("https://seller.test/summarise", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await res.text()).toBe("ok");
    expect(seen).toEqual(["summarise this", "summarise this"]);
  });

  it("returns any non-402 response untouched and never pays", async () => {
    const g = client(true);
    const pay = vi.spyOn(g, "pay");
    const f = g.withTrust(async () => new Response("hi"), { minScore: 0, minReviewers: 0, maxAmount: "1" });

    expect(await (await f("https://seller.test/")).text()).toBe("hi");
    expect(pay).not.toHaveBeenCalled();
  });

  it("passes through a 402 in some other scheme", async () => {
    const g = client(true);
    const other = Response.json({ x402Version: 1, accepts: [{ scheme: "exact" }] }, { status: 402 });
    const res = await g.withTrust(async () => other, { minScore: 0, minReviewers: 0, maxAmount: "1" })("https://s.test/");
    expect(res.status).toBe(402);
  });

  it("refuses an untrusted agent before paying anything", async () => {
    const g = client(true);
    vi.spyOn(g, "score").mockResolvedValue({ ...unrated, reviewers: 9, score: 40, confidence: "ok" });
    const seller = paywall();
    const f = g.withTrust((i, init) => seller(new Request(i, init)), { minScore: 70, minReviewers: 3, maxAmount: "1" });

    await expect(f("https://seller.test/summarise")).rejects.toBeInstanceOf(UntrustedAgentError);
  });

  it("refuses a price over the cap", async () => {
    const g = client(true);
    vi.spyOn(g, "score").mockResolvedValue(unrated);
    const seller = paywall();
    const f = g.withTrust((i, init) => seller(new Request(i, init)), { minScore: 0, minReviewers: 0, maxAmount: "0.01" });

    await expect(f("https://seller.test/summarise")).rejects.toThrow(/over the 0.01 cap/);
  });

  it("refuses an offer that pays some other router", async () => {
    const g = client(true);
    const res = await paywall()(new Request("https://seller.test/summarise"));
    const body = (await res.json()) as PaymentRequired;
    body.accepts[0]!.payTo = "0x3000000000000000000000000000000000000003";
    const f = g.withTrust(async () => Response.json(body, { status: 402 }), { minScore: 0, minReviewers: 0, maxAmount: "1" });

    await expect(f("https://seller.test/summarise")).rejects.toBeInstanceOf(GroundedError);
  });
});

describe("check", () => {
  it("lets a policy that asks for no reviewers accept an unrated agent", async () => {
    const g = client();
    vi.spyOn(g, "score").mockResolvedValue(unrated);
    expect((await g.check(7n, { minScore: 0, minReviewers: 0 })).pass).toBe(true);
    const strict = await g.check(7n, { minScore: 0, minReviewers: 1 });
    expect(strict.reasons.join(" ")).toContain("no grounded ratings yet");
  });
});
