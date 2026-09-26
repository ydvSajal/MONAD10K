import { monadTestnet } from "@grounded/sdk";
import { createPublicClient, createWalletClient, erc20Abi, http, isAddress, parseEther, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getChain } from "../../../lib/grounded";
import { retryAfter } from "../../../lib/ratelimit";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/**
 * Testnet funds for a fresh playground wallet: a little MON for gas and a little USDC to pay with.
 * The drip wallet is a testnet-only key from `DRIP_PRIVATE_KEY` with no role in any contract. Without
 * Privy there is no identity to gate on, so it is capped per address and per IP, and the amounts are small.
 */
export async function POST(req: Request) {
  const key = process.env.DRIP_PRIVATE_KEY as Hex | undefined;
  const chain = getChain();
  if (!key || !chain) return json({ error: "the test-funds faucet is not configured on this deployment" }, 503);

  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  if (!body?.address || !isAddress(body.address)) return json({ error: "address must be a valid 0x address" }, 400);
  const to: Address = body.address;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = Math.max(retryAfter(`drip:addr:${to.toLowerCase()}`, 1, DAY_MS), retryAfter(`drip:ip:${ip}`, 5, DAY_MS));
  if (wait > 0) return json({ error: "already funded: one drip per address per day" }, 429, { "retry-after": String(wait) });

  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ chain: monadTestnet, transport: http(rpc), account });
  const pub = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
  const mon = parseEther(process.env.DRIP_MON_AMOUNT ?? "0.2");
  const usdc = parseUnits(process.env.DRIP_USDC_AMOUNT ?? "1", 6);

  const [monBalance, usdcBalance] = await Promise.all([
    pub.getBalance({ address: account.address }),
    pub.readContract({ address: chain.deployment.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  ]);
  if (monBalance < mon * 2n || usdcBalance < usdc) return json({ error: "the faucet is empty; try again later" }, 503);

  // Monad bills the gas limit, so give each transaction its estimate plus 15% and no more.
  const monTx = await wallet.sendTransaction({ to, value: mon, gas: 21_000n });
  await pub.waitForTransactionReceipt({ hash: monTx });
  const args = { address: chain.deployment.usdc, abi: erc20Abi, functionName: "transfer", args: [to, usdc], account } as const;
  const gas = ((await pub.estimateContractGas(args)) * 115n) / 100n;
  const usdcTx = await wallet.writeContract({ ...args, gas });
  await pub.waitForTransactionReceipt({ hash: usdcTx });

  return json({ monTx, usdcTx, mon: process.env.DRIP_MON_AMOUNT ?? "0.2", usdc: process.env.DRIP_USDC_AMOUNT ?? "1" });
}
