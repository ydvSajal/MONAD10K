import { readFileSync } from "node:fs";

import { Grounded, type Addresses } from "@sajalydv/grounded-sdk";
import type { PublicClient } from "viem";

export type Deployment = Addresses & { deployedAtBlock: number; rpId: string };

export interface Chain {
  grounded: Grounded;
  client: PublicClient;
  deployment: Deployment;
}

let chain: Chain | null | undefined;

/**
 * The deployment this explorer reads, from `GROUNDED_ADDRESSES`: inline JSON (hosting) or a path
 * to `deployments/10143.json` (local). `null` until Grounded is deployed, and pages say so.
 * `RPC_URL_FALLBACK` (Alchemy, QuickNode) takes over when the public RPC fails or rate limits us.
 */
export function getChain(): Chain | null {
  if (chain !== undefined) return chain;
  const source = process.env.GROUNDED_ADDRESSES?.trim();
  if (!source) return (chain = null);
  const deployment: Deployment = JSON.parse(source.startsWith("{") ? source : readFileSync(source, "utf8"));
  const grounded = new Grounded({
    chain: "monad-testnet",
    ...(process.env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: process.env.NEXT_PUBLIC_RPC_URL } : {}),
    ...(process.env.RPC_URL_FALLBACK ? { fallbackRpcUrl: process.env.RPC_URL_FALLBACK } : {}),
    addresses: deployment,
  });
  return (chain = { grounded, client: grounded.publicClient, deployment });
}
