import { readFileSync } from "node:fs";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Grounded } from "@grounded/sdk";
import { groundedPaywall, memoryReceiptStore } from "@grounded/sdk/server";

const env = process.env;
const agentId = env.SELLER_AGENT_ID;
if (!agentId) throw new Error("SELLER_AGENT_ID is required: the ERC-8004 agent this seller is paid as");
const price = env.SELLER_PRICE_USDC ?? "0.05";
const port = Number(env.PORT ?? 8787);

const grounded = new Grounded({
  chain: "monad-testnet",
  ...(env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: env.NEXT_PUBLIC_RPC_URL } : {}),
  addresses: JSON.parse(readFileSync(env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8")),
});

const app = new Hono();
// The explorer page calls this from another origin; cors() also echoes X-GROUNDED-RECEIPT on preflight.
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, agentId, price }));

// ponytail: memory store forgets used receipts on restart, so one receipt can buy twice across restarts.
// Swap in a Postgres ReceiptStore (DATABASE_URL) before this runs anywhere but a laptop.
app.get("/insight", groundedPaywall({ grounded, agentId, price, store: memoryReceiptStore() }), (c) =>
  c.json({
    agentId,
    insight: "Paid for by an onchain receipt. Rate this answer with the same receipt to count toward my score.",
    servedAt: new Date().toISOString(),
  }),
);

serve({ fetch: app.fetch, port }, () => console.log(`demo-seller: agent ${agentId}, ${price} USDC, http://localhost:${port}`));
