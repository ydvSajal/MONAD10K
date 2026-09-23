import { beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  http,
  keccak256,
  encodeAbiParameters,
  parseEther,
  toHex,
} from "viem";
import type { Address, PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { Grounded } from "../src/grounded.js";
import { SoftwareAuthenticator } from "../src/authenticator.js";
import { erc8004IdentityAbi, erc8004ReputationAbi } from "../src/abi.js";
import { AgentNotPayableError, ContractRevertError, ReceiptAlreadyUsedError } from "../src/errors.js";
import { monadTestnet } from "../src/chain.js";
import { groundedPaywall, memoryReceiptStore } from "../src/server.js";
import { RECEIPT_HEADER } from "../src/x402.js";
import { UntrustedAgentError } from "../src/errors.js";

/**
 * The whole write path against the real contracts on an anvil fork of Monad testnet, with the live
 * ERC-8004 registries underneath. Same setup as read.test.ts, but deploy with RP_ID=localhost:
 *
 *   RP_ID=localhost forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
 *     --private-key <anvil key 0> --broadcast --skip-simulation
 *
 * Every run uses a fresh buyer, so the assertions are deltas and the fork can be reused.
 */
const rpcUrl = process.env.GROUNDED_TEST_RPC;
const addressesPath = process.env.GROUNDED_TEST_ADDRESSES;

const AGENT = 1n; // has a payout wallet (census, 23 Sep)
const UNPAYABLE_AGENT = 25n; // never set one

describe.skipIf(!rpcUrl || !addressesPath)("write path (forked chain)", () => {
  let deployment: Record<string, string> & { rpId: string };
  let publicClient: PublicClient;
  const testClient = createTestClient({ chain: monadTestnet, mode: "anvil", transport: http(rpcUrl) });

  beforeAll(async () => {
    const { readFile } = await import("node:fs/promises");
    deployment = JSON.parse(await readFile(addressesPath!, "utf8"));
    publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) }) as PublicClient;
  });

  /** A funded wallet with its own Grounded client and passkey. */
  async function buyer(account = privateKeyToAccount(generatePrivateKey()) as { address: Address }) {
    await testClient.setBalance({ address: account.address, value: parseEther("10") });
    await fundUsdc(account.address, 10_000_000n);
    const walletClient = createWalletClient({ chain: monadTestnet, transport: http(rpcUrl), account: account as never });
    const g = new Grounded({ chain: "monad-testnet", publicClient, walletClient, addresses: deployment as never });
    return { g, address: account.address, auth: SoftwareAuthenticator.random(deployment.rpId) };
  }

  /** FiatToken keeps balances in a plain mapping; find its slot once by probing. */
  let balanceSlot: bigint | undefined;
  async function fundUsdc(holder: Address, amount: bigint) {
    const usdc = deployment.usdc as Address;
    const slotFor = (s: bigint) =>
      keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, s]));
    for (const s of balanceSlot === undefined ? Array.from({ length: 20 }, (_, i) => BigInt(i)) : [balanceSlot]) {
      await testClient.setStorageAt({ address: usdc, index: slotFor(s), value: toHex(amount, { size: 32 }) });
      const bal = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [holder] });
      if (bal === amount) {
        balanceSlot = s;
        return;
      }
      await testClient.setStorageAt({ address: usdc, index: slotFor(s), value: toHex(0n, { size: 32 }) });
    }
    throw new Error("could not find the USDC balance slot");
  }

  const lastIndex = (g: Grounded, client: Address) =>
    g.publicClient.readContract({
      address: deployment.erc8004Reputation as Address,
      abi: erc8004ReputationAbi,
      functionName: "getLastIndex",
      args: [AGENT, client],
    });

  it("binds a passkey, pays, rates, and the rating counts", async () => {
    const { g, auth } = await buyer();
    const before = await g.score(AGENT);

    await g.bindPasskey(auth);
    const { receiptId } = await g.pay({ agentId: AGENT, amount: "0.5" });
    const { feedbackIndex } = await g.rate({ receiptId, score: 80, authenticator: auth });

    const after = await g.score(AGENT);
    expect(feedbackIndex).toBeGreaterThan(0n);
    expect(after.reviewers).toBe(before.reviewers + 1);
    expect(after.receipts).toBe(before.receipts + 1);
    expect(Number(after.paid) - Number(before.paid)).toBeCloseTo(0.5, 6);
  });

  it("pays by EIP-3009 authorization, and a second rating replaces the first", async () => {
    const { g, auth } = await buyer();
    await g.bindPasskey(auth);
    await g.rate({ ...(await g.pay({ agentId: AGENT, amount: "0.05" })), score: 90, authenticator: auth });
    const mid = await g.score(AGENT);

    const { receiptId } = await g.pay({ agentId: AGENT, amount: "0.05", mode: "authorization" });
    await g.rate({ receiptId, score: 20, authenticator: auth });

    const after = await g.score(AGENT);
    expect(after.reviewers).toBe(mid.reviewers); // same reviewer, one live vote
    expect(after.receipts).toBe(mid.receipts + 1);
  });

  it("refuses a used receipt before posting any feedback", async () => {
    const { g, address, auth } = await buyer();
    await g.bindPasskey(auth);
    const { receiptId } = await g.pay({ agentId: AGENT, amount: "0.05" });
    await g.rate({ receiptId, score: 70, authenticator: auth });
    const index = await lastIndex(g, address);

    await expect(g.rate({ receiptId, score: 70, authenticator: auth })).rejects.toBeInstanceOf(ReceiptAlreadyUsedError);
    expect(await lastIndex(g, address)).toBe(index);
  });

  it("catches an excluded reviewer in preflight, so no orphan feedback is posted", async () => {
    const owner = await publicClient.readContract({
      address: deployment.erc8004Identity as Address,
      abi: erc8004IdentityAbi,
      functionName: "ownerOf",
      args: [AGENT],
    });
    await testClient.impersonateAccount({ address: owner });
    try {
      const { g, auth } = await buyer({ address: owner, type: "json-rpc" } as never);
      await g.bindPasskey(auth);
      const { receiptId } = await g.pay({ agentId: AGENT, amount: "0.05" });
      const index = await lastIndex(g, owner);

      const err = await g.rate({ receiptId, score: 100, authenticator: auth }).catch((e) => e);
      expect(err).toBeInstanceOf(ContractRevertError);
      expect(err.errorName).toBe("ExcludedReviewer");
      expect(await lastIndex(g, owner)).toBe(index);
    } finally {
      await testClient.stopImpersonatingAccount({ address: owner });
    }
  });

  it("refuses to pay an agent with no payout wallet, before spending an approve", async () => {
    const { g } = await buyer();
    await expect(g.pay({ agentId: UNPAYABLE_AGENT, amount: "0.05" })).rejects.toBeInstanceOf(AgentNotPayableError);
  });

  /** A seller for AGENT behind the paywall, reachable as a plain fetch, no HTTP server needed. */
  function seller() {
    const grounded = new Grounded({ chain: "monad-testnet", publicClient, addresses: deployment as never });
    const mw = groundedPaywall({ grounded, agentId: AGENT, price: "0.05", store: memoryReceiptStore() });
    return async (input: RequestInfo | URL, init?: RequestInit) =>
      (await mw({ req: { raw: new Request(input, init) } }, async () => {})) ?? new Response("summary");
  }
  const URL_ = "https://seller.test/summarise";
  const usdcOf = (who: Address) =>
    publicClient.readContract({ address: deployment.usdc as Address, abi: erc20Abi, functionName: "balanceOf", args: [who] });

  it("402 loop: a trusted agent is paid through the paywall and serves 200, once per receipt", async () => {
    const rater = await buyer(); // make sure AGENT has at least one grounded reviewer
    await rater.g.bindPasskey(rater.auth);
    await rater.g.rate({ ...(await rater.g.pay({ agentId: AGENT, amount: "0.05" })), score: 80, authenticator: rater.auth });

    const { g, address } = await buyer();
    const sent: Request[] = [];
    const s = seller();
    const f = g.withTrust(
      async (i, init) => {
        sent.push(new Request(i, init));
        return s(i, init);
      },
      { minScore: 0, minReviewers: 1, maxAmount: "0.10" },
    );

    const before = await usdcOf(address);
    const res = await f(URL_);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("summary");
    expect(before - (await usdcOf(address))).toBe(50_000n);

    // the same signed header again: the receipt already bought its response
    const replay = await s(URL_, { headers: { [RECEIPT_HEADER]: sent[1]!.headers.get(RECEIPT_HEADER)! } });
    expect(replay.status).toBe(402);
    expect((await replay.json()).error).toContain("already used");
  });

  it("402 loop: an untrusted agent gets nothing paid", async () => {
    const { g, address } = await buyer();
    const before = await usdcOf(address);
    const f = g.withTrust(seller(), { minScore: 0, minReviewers: 1_000_000, maxAmount: "0.10" });

    await expect(f(URL_)).rejects.toBeInstanceOf(UntrustedAgentError);
    expect(await usdcOf(address)).toBe(before);
  });

  it("402 loop: a receipt id alone is worthless to anyone but its payer", async () => {
    const victim = await buyer();
    const { receiptId } = await victim.g.pay({ agentId: AGENT, amount: "0.05" });
    const thief = await buyer();

    // receipt ids are public onchain; the thief signs a header claiming the victim's
    const res = await seller()(URL_, { headers: { [RECEIPT_HEADER]: await thief.g.signAccess(receiptId, URL_, "GET") } });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toContain("paid by someone else");
  });
});
