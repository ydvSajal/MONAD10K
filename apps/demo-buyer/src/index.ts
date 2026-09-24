import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Grounded, UntrustedAgentError, monadTestnet } from "@grounded/sdk";

const { values: args } = parseArgs({
  options: {
    target: { type: "string", default: "http://localhost:8787/insight" },
    "min-score": { type: "string", default: "70" },
    "min-reviewers": { type: "string", default: "1" },
    max: { type: "string", default: "0.10" },
  },
});

const env = process.env;
const key = env.BUYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("BUYER_PRIVATE_KEY is required: the testnet wallet that pays sellers");

const walletClient = createWalletClient({
  chain: monadTestnet,
  transport: http(env.NEXT_PUBLIC_RPC_URL),
  account: privateKeyToAccount(key),
});
const grounded = new Grounded({
  chain: "monad-testnet",
  ...(env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: env.NEXT_PUBLIC_RPC_URL } : {}),
  walletClient,
  addresses: JSON.parse(readFileSync(env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8")),
});

// Pays only if the seller's agent meets the policy; an untrusted agent is refused before any money moves.
const buy = grounded.withTrust(fetch, {
  minScore: Number(args["min-score"]),
  minReviewers: Number(args["min-reviewers"]),
  maxAmount: args.max,
});

try {
  const res = await buy(args.target);
  console.log(`HTTP ${res.status}`);
  console.log(await res.text());
  process.exitCode = res.ok ? 0 : 1;
} catch (e) {
  if (!(e instanceof UntrustedAgentError)) throw e;
  console.log(`refused agent ${e.agentId}:`);
  for (const r of e.reasons) console.log(`  - ${r}`);
  process.exitCode = 2;
}
