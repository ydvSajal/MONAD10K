import { readFileSync } from "node:fs";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Grounded } from "@sajalydv/grounded-sdk";
import { groundedPaywall, memoryReceiptStore } from "@sajalydv/grounded-sdk/server";

import { postgresReceiptStore } from "./pgStore.js";

const env = process.env;
const agentId = env.SELLER_AGENT_ID;
if (!agentId) throw new Error("SELLER_AGENT_ID is required: the ERC-8004 agent this seller is paid as");
const price = env.SELLER_PRICE_USDC ?? "0.05";
const port = Number(env.PORT ?? 8787);

const grounded = new Grounded({
  chain: "monad-testnet",
  ...(env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: env.NEXT_PUBLIC_RPC_URL } : {}),
  ...(env.RPC_URL_FALLBACK ? { fallbackRpcUrl: env.RPC_URL_FALLBACK } : {}),
  addresses: JSON.parse(readFileSync(env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8")),
});

const app = new Hono();
// The explorer page calls this from another origin; cors() also echoes X-GROUNDED-RECEIPT on preflight.
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, agentId, price }));

// ponytail: without DATABASE_URL the store is in memory and forgets used receipts on restart, so one
// receipt can buy twice across restarts. Set DATABASE_URL (Postgres) for anything but a laptop.
const store = env.DATABASE_URL ? await postgresReceiptStore(env.DATABASE_URL) : memoryReceiptStore();

app.get("/insight", groundedPaywall({ grounded, agentId, price, store }), (c) =>
  c.json({
    agentId,
    insight: "Paid for by an onchain receipt. Rate this answer with the same receipt to count toward my score.",
    servedAt: new Date().toISOString(),
  }),
);

serve({ fetch: app.fetch, port }, () => console.log(`demo-seller: agent ${agentId}, ${price} USDC, http://localhost:${port}`));
