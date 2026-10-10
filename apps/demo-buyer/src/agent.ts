// A buyer whose decisions are made by a language model, inside limits the model cannot change.
//
//   AI_BASE_URL=https://api.moonshot.ai/v1 AI_MODEL=<model> AI_API_KEY=... BUYER_PRIVATE_KEY=0x... \
//     pnpm --filter @grounded/demo-buyer agent -- --target http://localhost:8787/insight --target http://localhost:8788/insight
//
// Any OpenAI-compatible endpoint works (Moonshot/KIMI, Alibaba Qwen, and others): swapping the model is
// three environment variables, not code.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Grounded, monadTestnet } from "@sajalydv/grounded-sdk";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { runBuyerAgent } from "./agentCore.js";

const { values: args } = parseArgs({
  options: {
    target: { type: "string", multiple: true },
    "min-score": { type: "string", default: "70" },
    "min-reviewers": { type: "string", default: "1" },
    max: { type: "string", default: "0.10" },
  },
});

const env = process.env;
for (const name of ["AI_BASE_URL", "AI_MODEL", "AI_API_KEY", "BUYER_PRIVATE_KEY"]) {
  if (!env[name]) throw new Error(`${name} is required (see .env.example)`);
}
const targets = args.target as [string, ...string[]] | undefined;
if (!targets?.length) throw new Error("pass at least one --target <seller url>");

const account = privateKeyToAccount(env.BUYER_PRIVATE_KEY as Hex);
const grounded = new Grounded({
  chain: "monad-testnet",
  walletClient: createWalletClient({ chain: monadTestnet, transport: http(env.NEXT_PUBLIC_RPC_URL), account }),
  ...(env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: env.NEXT_PUBLIC_RPC_URL } : {}),
  ...(env.RPC_URL_FALLBACK ? { fallbackRpcUrl: env.RPC_URL_FALLBACK } : {}),
  addresses: JSON.parse(readFileSync(env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8")),
});

const provider = createOpenAICompatible({ name: "trust-model", baseURL: env.AI_BASE_URL!, apiKey: env.AI_API_KEY! });

const { text, purchases, calls } = await runBuyerAgent({
  model: provider.chatModel(env.AI_MODEL!),
  grounded,
  targets,
  policy: { minScore: Number(args["min-score"]), minReviewers: Number(args["min-reviewers"]) },
  maxAmount: args.max!,
});

for (const c of calls) console.log(`${c.tool} ${JSON.stringify(c.input)} -> ${JSON.stringify(c.output)}`);
console.log(`\n${text}\n(purchases: ${purchases})`);
