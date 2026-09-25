import { readFileSync } from "node:fs";

import { Grounded, monadTestnet, type Addresses } from "@grounded/sdk";
import { createPublicClient, http, type PublicClient } from "viem";

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
 */
export function getChain(): Chain | null {
  if (chain !== undefined) return chain;
  const source = process.env.GROUNDED_ADDRESSES?.trim();
  if (!source) return (chain = null);
  const deployment: Deployment = JSON.parse(source.startsWith("{") ? source : readFileSync(source, "utf8"));
  const client = createPublicClient({ chain: monadTestnet, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });
  const grounded = new Grounded({ chain: "monad-testnet", publicClient: client, addresses: deployment });
  return (chain = { grounded, client, deployment });
}
