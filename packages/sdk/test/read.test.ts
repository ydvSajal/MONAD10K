import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import type { PublicClient } from "viem";

import { Grounded } from "../src/grounded.js";
import { NotDeployedError } from "../src/errors.js";
import { monadTestnet } from "../src/chain.js";

/**
 * These run against a local fork with the contracts deployed:
 *
 *   anvil --fork-url https://testnet-rpc.monad.xyz
 *   cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
 *     --private-key <anvil key 0> --broadcast --skip-simulation
 *
 * Point GROUNDED_TEST_RPC at that fork and GROUNDED_TEST_ADDRESSES at deployments/10143.json.
 * Without them the deployment-dependent cases are skipped, so CI stays offline and deterministic
 * (the same rule as the Foundry fork tests).
 */
const rpcUrl = process.env.GROUNDED_TEST_RPC;
const addressesPath = process.env.GROUNDED_TEST_ADDRESSES;

async function loadAddresses() {
  if (!addressesPath) return undefined;
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(addressesPath, "utf8"));
}

describe("Grounded (no network)", () => {
  it("throws a useful error when the contract address is unknown", async () => {
    const g = new Grounded({ chain: "monad-testnet" });
    await expect(g.score(1n)).rejects.toBeInstanceOf(NotDeployedError);
    await expect(g.score(1n)).rejects.toThrow(/not deployed yet/);
  });

  it("knows the ERC-8004 and USDC addresses without being told", () => {
    const g = new Grounded({ chain: "monad-testnet" });
    expect(g.publicClient.chain?.id).toBe(10143);
  });

  it("rejects an out-of-range policy at the boundary", async () => {
    const g = new Grounded({ chain: "monad-testnet" });
    await expect(g.check(1n, { minScore: 101, minReviewers: 0 })).rejects.toThrow();
    await expect(g.check(1n, { minScore: 50, minReviewers: -1 })).rejects.toThrow();
  });

  it("rejects a negative agent id", async () => {
    const g = new Grounded({ chain: "monad-testnet" });
    await expect(g.score(-1)).rejects.toThrow();
  });
});

describe.skipIf(!rpcUrl || !addressesPath)("Grounded (forked chain)", () => {
  async function client() {
    const addresses = await loadAddresses();
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(rpcUrl),
    }) as PublicClient;
    return new Grounded({ chain: "monad-testnet", publicClient, addresses });
  }

  it("reads a fresh agent as unrated, and says so rather than scoring it zero", async () => {
    const g = await client();
    // Agent 2, not 1: write.fork.test.ts rates agent 1, and vitest runs files in parallel.
    const score = await g.score(2n);

    expect(score.agentId).toBe(2n);
    expect(score.score).toBe(0);
    expect(score.reviewers).toBe(0);
    expect(score.confidence).toBe("none");
    expect(score.updatedAt).toBeNull();
    expect(score.paid).toBe("0");
  });

  it("fails a policy check on an unrated agent, and explains why", async () => {
    const g = await client();
    const result = await g.check(2n, { minScore: 70, minReviewers: 5 });

    expect(result.pass).toBe(false);
    expect(result.reasons.join(" ")).toContain("no grounded ratings yet");
    expect(result.reasons.some((r) => r.includes("0 reviewers"))).toBe(true);
  });

  it("reports the payout wallet, and null for an agent that cannot be paid", async () => {
    const g = await client();
    // agent 1 set a wallet; agent 25 never did (census, 23 Sep)
    expect(await g.payoutWallet(1n)).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(await g.payoutWallet(25n)).toBeNull();
  });
});
