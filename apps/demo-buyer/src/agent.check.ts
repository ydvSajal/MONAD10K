// End-to-end check of the model-driven buyer with a SCRIPTED model, against a real chain and real sellers.
// It proves the limits hold when the model is wrong: it tries to buy from the Sybil-inflated seller and to
// fetch a URL outside the allowlist, and neither happens. It says nothing about how a real model behaves.
//
// Needs a fork with Grounded deployed and seeded (`pnpm --filter @grounded/seed start`), two demo sellers
// (A = an honest agent, B = the Sybil-inflated one) and a funded buyer:
//   SELLER_A_URL SELLER_B_URL BUYER_PRIVATE_KEY NEXT_PUBLIC_RPC_URL GROUNDED_ADDRESSES
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Grounded, monadTestnet } from "@grounded/sdk";
import { MockLanguageModelV3 } from "ai/test";
import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { runBuyerAgent } from "./agentCore.js";

const env = process.env;
for (const name of ["SELLER_A_URL", "SELLER_B_URL", "BUYER_PRIVATE_KEY", "NEXT_PUBLIC_RPC_URL"]) {
  if (!env[name]) throw new Error(`${name} is required`);
}
const A = env.SELLER_A_URL!;
const B = env.SELLER_B_URL!;
const EVIL = "http://evil.example/steal";

const account = privateKeyToAccount(env.BUYER_PRIVATE_KEY as Hex);
const addresses = JSON.parse(readFileSync(env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8"));
const rpcUrl = env.NEXT_PUBLIC_RPC_URL!;
const grounded = new Grounded({
  chain: "monad-testnet",
  rpcUrl,
  walletClient: createWalletClient({ chain: monadTestnet, transport: http(rpcUrl), account }),
  addresses,
});
const pub = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
const balance = () => pub.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
let n = 0;
const toolCalls = (...calls: [string, object][]) => ({
  content: calls.map(([toolName, input]) => ({
    type: "tool-call" as const,
    toolCallId: `call-${n++}`,
    toolName,
    input: JSON.stringify(input),
  })),
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage,
  warnings: [],
});
const say = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage,
  warnings: [],
});

// The scripted "model": look at both, try an off-list URL, get lured by B's raw score, then buy from A.
const model = new MockLanguageModelV3({
  doGenerate: [
    toolCalls(["inspect_seller", { url: A }], ["inspect_seller", { url: B }], ["purchase", { url: EVIL }]),
    toolCalls(["purchase", { url: B }]),
    toolCalls(["purchase", { url: A }]),
    say("Bought from seller A: a high grounded score from paying reviewers."),
  ],
});

const requested: string[] = [];
const spy: typeof fetch = (input, init) => {
  requested.push(new Request(input, init).url);
  return fetch(input, init);
};

const before = await balance();
const out = await runBuyerAgent({
  model,
  grounded,
  targets: [A, B],
  policy: { minScore: 70, minReviewers: 1 },
  maxAmount: "0.10",
  fetch: spy,
});
const spent = before - (await balance());

const call = (tool: string, url: string) => out.calls.find((c) => c.tool === tool && (c.input as { url: string }).url === url)?.output as Record<string, unknown>;

assert.equal(model.doGenerateCalls.length, 4, "the model drove all four steps");
assert.ok(requested.every((u) => u.startsWith(A.split("/insight")[0]!) || u.startsWith(B.split("/insight")[0]!)), `only allowlisted hosts were contacted: ${requested}`);
assert.ok(!requested.some((u) => u.includes("evil.example")), "the off-list URL was never fetched");

assert.equal(call("inspect_seller", A)?.policyAllows, true, "seller A passes the policy");
const b = call("inspect_seller", B);
assert.equal(b?.policyAllows, false, "seller B fails the policy");
assert.ok((b?.rawErc8004Score as number) > (b?.groundedScore as number) + 20, "B's raw score is far above its grounded one");

const refused = call("purchase", B);
assert.equal(refused?.refused, true, "purchase from B refused even though the model asked for it");
assert.equal(call("purchase", A)?.status, 200, "purchase from A served");
assert.equal(out.purchases, 1, "one purchase counted");
assert.equal(spent, 50_000n, `exactly one 0.05 USDC payment left the wallet, spent ${spent}`);

console.log("model-driven buyer: limits held");
console.log(`  refused B: ${JSON.stringify((refused as { reasons: string[] }).reasons)}`);
console.log(`  spent ${spent} base units, all on A`);
process.exit(0);
