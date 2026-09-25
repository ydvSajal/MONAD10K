// Stdio MCP server. Configure a client to run:  npx tsx packages/mcp/src/bin.ts
// Env: GROUNDED_ADDRESSES (deployments/10143.json path or inline JSON), NEXT_PUBLIC_RPC_URL, RPC_URL_FALLBACK.
import { readFileSync } from "node:fs";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Grounded } from "@grounded/sdk";

import { createServer } from "./server.js";

const env = process.env;
const source = env.GROUNDED_ADDRESSES?.trim();
if (!source) {
  console.error("GROUNDED_ADDRESSES is required: a path to deployments/10143.json, or the JSON itself");
  process.exit(1);
}

const grounded = new Grounded({
  chain: "monad-testnet",
  ...(env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: env.NEXT_PUBLIC_RPC_URL } : {}),
  ...(env.RPC_URL_FALLBACK ? { fallbackRpcUrl: env.RPC_URL_FALLBACK } : {}),
  addresses: JSON.parse(source.startsWith("{") ? source : readFileSync(source, "utf8")),
});

// stdout is the protocol channel: anything human-readable goes to stderr.
await createServer(grounded).connect(new StdioServerTransport());
console.error("grounded MCP server ready (read-only: grounded_score, grounded_check)");
