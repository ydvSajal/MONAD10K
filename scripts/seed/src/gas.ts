// Gas actually used by each Grounded transaction, on an anvil fork with the live ERC-8004 registries,
// live USDC and Monad's P-256 precompile underneath. Each call is a real transaction, so storage starts
// cold, which is what a user pays. Prints a table for docs/gas.md.
//
//   pnpm --filter @grounded/seed gas
import { readFileSync } from "node:fs";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  parseEther,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Grounded, SoftwareAuthenticator, monadTestnet } from "@grounded/sdk";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const addresses = JSON.parse(readFileSync(process.env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8"));
const transport = http(rpcUrl);
const pub = createPublicClient({ chain: monadTestnet, transport });
const anvil = createTestClient({ chain: monadTestnet, mode: "anvil", transport });

const identityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
const revokeAbi = parseAbi(["function revokeFeedback(uint256 agentId, uint64 feedbackIndex)"]);
const sweepAbi = parseAbi(["function sweepRevoked(uint256 agentId, address reviewer)"]);

async function fund(a: Address) {
  await anvil.setBalance({ address: a, value: parseEther("10") });
  const want = 10_000_000n;
  for (let s = 0n; s < 20n; s++) {
    const index = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [a, s]));
    await anvil.setStorageAt({ address: addresses.usdc, index, value: toHex(want, { size: 32 }) });
    const bal = await pub.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [a] });
    if (bal === want) return;
    await anvil.setStorageAt({ address: addresses.usdc, index, value: toHex(0n, { size: 32 }) });
  }
  throw new Error("could not find the USDC balance slot");
}

async function actor() {
  const account = privateKeyToAccount(generatePrivateKey());
  await fund(account.address);
  const wallet = createWalletClient({ chain: monadTestnet, transport, account });
  return { account, wallet, g: new Grounded({ chain: "monad-testnet", publicClient: pub, walletClient: wallet, addresses }) };
}

const used = async (hash: Hex) => (await pub.getTransactionReceipt({ hash })).gasUsed;
const rows: [string, bigint][] = [];
const row = async (name: string, hash: Hex) => rows.push([name, await used(hash)]);

// An agent of our own with a payout wallet, so no real agent is touched.
const owner = await actor();
const agentId = await (async () => {
  const hash = await owner.wallet.writeContract({
    address: addresses.erc8004Identity,
    abi: identityAbi,
    functionName: "register",
    args: ["data:,grounded-gas"],
  });
  const [log] = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: (await pub.waitForTransactionReceipt({ hash })).logs });
  const id = log!.args.agentId;
  const seller = privateKeyToAccount(generatePrivateKey());
  const deadline = (await pub.getBlock()).timestamp + 120n;
  const signature = await seller.signTypedData({
    domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: monadTestnet.id, verifyingContract: addresses.erc8004Identity },
    types: { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] },
    primaryType: "AgentWalletSet",
    message: { agentId: id, newWallet: seller.address, owner: owner.account.address, deadline },
  });
  await pub.waitForTransactionReceipt({
    hash: await owner.wallet.writeContract({ address: addresses.erc8004Identity, abi: identityAbi, functionName: "setAgentWallet", args: [id, seller.address, deadline, signature] }),
  });
  return id;
})();

// Reviewer 1: two-transaction `transfer` path (approve + pay), then bind, feedback, ground.
const r1 = await actor();
const auth1 = SoftwareAuthenticator.random(addresses.rpId);
await row("bind (first key)", await r1.g.bindPasskey(auth1));
const approveHash = await r1.wallet.writeContract({ address: addresses.usdc, abi: erc20Abi, functionName: "approve", args: [addresses.receiptRouter, 10_000_000n] });
await row("USDC approve (once)", approveHash);
const pay1 = await r1.g.pay({ agentId, amount: "0.10", mode: "transfer" });
await row("pay (transfer)", pay1.txHash);
const rate1 = await r1.g.rate({ receiptId: pay1.receiptId, score: 80, tag: "quality", authenticator: auth1 });
await row("giveFeedback (ERC-8004)", rate1.feedbackTx);
await row("ground (first rating)", rate1.groundTx);

// Reviewer 2: one-transaction `authorization` path, and a rating that later gets swept.
const r2 = await actor();
const auth2 = SoftwareAuthenticator.random(addresses.rpId);
await r2.g.bindPasskey(auth2);
const pay2 = await r2.g.pay({ agentId, amount: "0.10", mode: "authorization" });
await row("payWithAuthorization", pay2.txHash);
const rate2 = await r2.g.rate({ receiptId: pay2.receiptId, score: 60, tag: "quality", authenticator: auth2 });

// Reviewer 1 again: a second receipt replaces the first rating (histogram remove + add).
const pay3 = await r1.g.pay({ agentId, amount: "0.10", mode: "transfer" });
const rate3 = await r1.g.rate({ receiptId: pay3.receiptId, score: 90, tag: "quality", authenticator: auth1 });
await row("ground (replaces a rating)", rate3.groundTx);

// Reviewer 2 revokes the ERC-8004 feedback; anyone sweeps it out of the score.
await pub.waitForTransactionReceipt({
  hash: await r2.wallet.writeContract({ address: addresses.erc8004Reputation, abi: revokeAbi, functionName: "revokeFeedback", args: [agentId, rate2.feedbackIndex] }),
});
const sweepHash = await owner.wallet.writeContract({ address: addresses.groundedReputation, abi: sweepAbi, functionName: "sweepRevoked", args: [agentId, r2.account.address] });
await pub.waitForTransactionReceipt({ hash: sweepHash });
await row("sweepRevoked", sweepHash);

console.log("| Transaction | Gas used |\n|---|---|");
for (const [name, gas] of rows) console.log(`| ${name} | ${gas.toLocaleString("en-US")} |`);
