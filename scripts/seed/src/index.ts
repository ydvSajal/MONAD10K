// Demo data for the explorer. On an anvil fork, wallets are funded with cheat codes. On a live chain,
// set SEED_FUNDER_KEY to a wallet holding ~4 MON + 1 USDC; it funds each generated wallet by transfer
// (leftover dust stays in the throwaway wallets).
//
//   A  honest:      5 paying reviewers rate it well.
//   B  sybil:       2 paying reviewers rate it badly, then 10 unpaid wallets post 100s straight to
//                   ERC-8004. The raw ERC-8004 average climbs; the grounded score does not move.
//   C  wash:        its owner pays it and tries to rate it. Rejected. One real reviewer rates it.
//
// Every agent is registered here, so no real third-party agent is touched.
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
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Grounded, SoftwareAuthenticator, erc8004ReputationAbi, monadTestnet } from "@sajalydv/grounded-sdk";

const env = process.env;
const rpcUrl = env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const addresses = JSON.parse(readFileSync(env.GROUNDED_ADDRESSES ?? "../../deployments/10143.json", "utf8"));
const rpId: string = addresses.rpId;

const identityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

const transport = http(rpcUrl);
const pub = createPublicClient({ chain: monadTestnet, transport });
const anvil = createTestClient({ chain: monadTestnet, mode: "anvil", transport });

const funderKey = env.SEED_FUNDER_KEY as Hex | undefined;
const isAnvil = await anvil.request({ method: "anvil_nodeInfo" } as never).then(() => true, () => false);
if (!isAnvil && !funderKey) throw new Error(`${rpcUrl} is not an anvil node: set SEED_FUNDER_KEY to a funded wallet to seed a live chain`);
const funder = isAnvil ? undefined : createWalletClient({ chain: monadTestnet, transport, account: privateKeyToAccount(funderKey!) });

const USDC_UNITS = 10_000_000n; // 10 USDC per funded wallet
let usdcSlot: bigint | undefined;

/** Live chain: send `mon` and `usdc` from the funder. Fork: 10 MON + 10 USDC by writing the balance slot. */
async function fund(a: Address, mon: string, usdc: bigint) {
  if (funder) {
    await pub.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: a, value: parseEther(mon) }) });
    if (usdc > 0n) {
      const hash = await funder.writeContract({ address: addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [a, usdc] });
      await pub.waitForTransactionReceipt({ hash });
    }
    // Monad checks a sender's balance against state a few blocks back, so a wallet funded in the last
    // block still looks empty ("Signer had insufficient balance"). Wait it out.
    const funded = await pub.getBlockNumber();
    while ((await pub.getBlockNumber()) < funded + 4n) await new Promise((r) => setTimeout(r, 500));
    return;
  }
  await anvil.setBalance({ address: a, value: parseEther("10") });
  const slotOf = (s: bigint) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [a, s]));
  const balance = () => pub.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [a] });
  for (const s of usdcSlot === undefined ? Array.from({ length: 20 }, (_, i) => BigInt(i)) : [usdcSlot]) {
    await anvil.setStorageAt({ address: addresses.usdc, index: slotOf(s), value: toHex(USDC_UNITS, { size: 32 }) });
    if ((await balance()) === USDC_UNITS) {
      usdcSlot = s;
      return;
    }
    await anvil.setStorageAt({ address: addresses.usdc, index: slotOf(s), value: toHex(0n, { size: 32 }) });
  }
  throw new Error("could not find the USDC balance slot");
}

// Live-chain budgets at ~100 gwei: a reviewer spends ~0.13 MON (bind + pay + rate + ground) and pays 0.10 USDC.
async function actor(mon = "0.3", usdc = 100_000n) {
  const account = privateKeyToAccount(generatePrivateKey());
  await fund(account.address, mon, usdc);
  const wallet = createWalletClient({ chain: monadTestnet, transport, account });
  const g = new Grounded({ chain: "monad-testnet", publicClient: pub, walletClient: wallet, addresses });
  return { account, wallet, g };
}

type Actor = Awaited<ReturnType<typeof actor>>;

/** Register an agent owned by `owner` whose payout wallet is a separate `seller` key. */
async function registerAgent(owner: Actor, name: string): Promise<bigint> {
  const hash = await owner.wallet.writeContract({
    address: addresses.erc8004Identity,
    abi: identityAbi,
    functionName: "register",
    args: [`data:,grounded-demo-${name}`],
  });
  const [log] = parseEventLogs({
    abi: identityAbi,
    eventName: "Registered",
    logs: (await pub.waitForTransactionReceipt({ hash })).logs,
  });
  const agentId = log!.args.agentId;

  // The registry wants the new wallet's own EIP-712 consent, with a deadline at most 5 minutes out.
  const seller = privateKeyToAccount(generatePrivateKey());
  const deadline = (await pub.getBlock()).timestamp + 120n;
  const signature = await seller.signTypedData({
    domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: monadTestnet.id, verifyingContract: addresses.erc8004Identity },
    types: {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentWalletSet",
    message: { agentId, newWallet: seller.address, owner: owner.account.address, deadline },
  });
  await pub.waitForTransactionReceipt({
    hash: await owner.wallet.writeContract({
      address: addresses.erc8004Identity,
      abi: identityAbi,
      functionName: "setAgentWallet",
      args: [agentId, seller.address, deadline, signature],
    }),
  });
  console.log(`registered agent ${name} = ${agentId}, payout wallet ${seller.address}`);
  return agentId;
}

/** A fresh reviewer: bind a passkey, pay the agent, rate it with that receipt. */
async function paidRating(agentId: bigint, score: number, amount = "0.10") {
  const r = await actor();
  const authenticator = SoftwareAuthenticator.random(rpId);
  await r.g.bindPasskey(authenticator);
  const { receiptId } = await r.g.pay({ agentId, amount });
  await r.g.rate({ receiptId, score, tag: "quality", authenticator });
  console.log(`  ${r.account.address} paid ${amount}, rated ${score}`);
}

/** Unpaid ERC-8004 feedback: counted by the raw average, ignored by Grounded. */
async function sybilRating(agentId: bigint, value: number) {
  const s = await actor("0.15", 0n);
  await pub.waitForTransactionReceipt({
    hash: await s.wallet.writeContract({
      address: addresses.erc8004Reputation,
      abi: erc8004ReputationAbi,
      functionName: "giveFeedback",
      args: [agentId, BigInt(value), 0, "quality", "", "", "", zeroHash],
    }),
  });
}

const owner = await actor("0.3");
const agentA = await registerAgent(owner, "honest");
const agentB = await registerAgent(owner, "sybil");
const agentC = await registerAgent(owner, "wash");

console.log(`A (${agentA}): five paying reviewers`);
for (const score of [85, 88, 90, 92, 95]) await paidRating(agentA, score);

console.log(`B (${agentB}): two paying reviewers, then ten unpaid sybils`);
for (const score of [22, 28]) await paidRating(agentB, score);
for (let i = 0; i < 10; i++) await sybilRating(agentB, 100);
console.log("  10 unpaid wallets posted 100 to ERC-8004");

console.log(`C (${agentC}): owner tries to rate its own agent`);
const ownerKey = SoftwareAuthenticator.random(rpId);
await owner.g.bindPasskey(ownerKey);
const { receiptId } = await owner.g.pay({ agentId: agentC, amount: "0.10" });
try {
  await owner.g.rate({ receiptId, score: 100, tag: "quality", authenticator: ownerKey });
  throw new Error("wash rating was accepted: the owner exclusion is broken");
} catch (e) {
  if (e instanceof Error && e.message.startsWith("wash rating was accepted")) throw e;
  console.log(`  rejected: ${(e as Error).message.split("\n")[0]}`);
}
await paidRating(agentC, 60);

console.log("\nagent  grounded  raw  reviewers  receipts  paid");
for (const [name, id] of [["A", agentA], ["B", agentB], ["C", agentC]] as const) {
  const s = await owner.g.score(id);
  console.log(
    `${name} ${String(id).padEnd(5)} ${String(s.score).padStart(8)} ${String(s.rawScore ?? "-").padStart(4)} ` +
      `${String(s.reviewers).padStart(10)} ${String(s.receipts).padStart(9)}  ${s.paid}`,
  );
}
