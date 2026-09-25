// Read-only census of the live ERC-8004 identity registry, for docs/OUTREACH.md.
//   pnpm --filter @grounded/seed census        -> census.json (gitignored) + a summary
import { writeFileSync } from "node:fs";

import { createPublicClient, http, parseAbi, zeroAddress } from "viem";
import { erc8004IdentityAbi, erc8004ReputationAbi, monadTestnet } from "@grounded/sdk";

const IDENTITY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";

const client = createPublicClient({
  chain: { ...monadTestnet, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } },
  transport: http(rpc),
  batch: { multicall: { batchSize: 8192, wait: 20 } },
});
const uriAbi = parseAbi(["function tokenURI(uint256) view returns (string)"]);

/** `undefined` on a revert, so a missing agent or a hostile tokenURI cannot stop the run. */
const tryRead = <T>(p: Promise<T>) => p.then((v) => v, () => undefined);
const ownerOf = (id: bigint) =>
  tryRead(client.readContract({ address: IDENTITY, abi: erc8004IdentityAbi, functionName: "ownerOf", args: [id] }));

// The registry mints ids sequentially from 1, so bisect for the last one.
let lo = 1n;
let hi = 100_000n;
while (lo < hi) {
  const mid = (lo + hi + 1n) / 2n;
  if (await ownerOf(mid)) lo = mid;
  else hi = mid - 1n;
}
const max = Number(lo);

const rows: { id: number; owner: string; wallet: string | null; uri: string | null; feedbackClients: number | null }[] = [];
for (let start = 1; start <= max; start += 200) {
  const ids = Array.from({ length: Math.min(200, max - start + 1) }, (_, i) => BigInt(start + i));
  rows.push(
    ...(await Promise.all(
      ids.map(async (id) => {
        const [owner, wallet, uri, clients] = await Promise.all([
          ownerOf(id),
          tryRead(client.readContract({ address: IDENTITY, abi: erc8004IdentityAbi, functionName: "getAgentWallet", args: [id] })),
          tryRead(client.readContract({ address: IDENTITY, abi: uriAbi, functionName: "tokenURI", args: [id] })),
          tryRead(client.readContract({ address: REPUTATION, abi: erc8004ReputationAbi, functionName: "getClients", args: [id] })),
        ]);
        return {
          id: Number(id),
          owner: owner ?? zeroAddress,
          wallet: wallet && wallet !== zeroAddress ? wallet : null,
          uri: uri ?? null,
          feedbackClients: clients ? clients.length : null,
        };
      }),
    )),
  );
}

writeFileSync("census.json", JSON.stringify(rows));

const perOwner = new Map<string, number>();
for (const r of rows) perOwner.set(r.owner, (perOwner.get(r.owner) ?? 0) + 1);
const top = [...perOwner.values()].sort((a, b) => b - a);
console.log(`agents ${rows.length}, owners ${perOwner.size}`);
console.log(`with payout wallet ${rows.filter((r) => r.wallet).length}, without ${rows.filter((r) => !r.wallet).length}`);
console.log(`with any ERC-8004 feedback ${rows.filter((r) => (r.feedbackClients ?? 0) > 0).length}`);
console.log(`top 5 owners hold ${top.slice(0, 5).reduce((a, b) => a + b, 0)} agents: read them before counting teams`);
