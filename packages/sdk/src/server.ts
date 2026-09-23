import { erc20Abi, isAddressEqual, parseUnits } from "viem";

import { receiptRegistryAbi, ReceiptStatus } from "./abi.js";
import type { Grounded } from "./grounded.js";
import { agentIdSchema, amountSchema } from "./types.js";
import {
  ACCESS_MAX_AGE_SEC,
  accessTypedData,
  decodeAccess,
  RECEIPT_HEADER,
  resourceOf,
  SCHEME,
  type PaymentRequired,
} from "./x402.js";

/** Remembers which receipts already bought a response. */
export interface ReceiptStore {
  /** True the first time a receipt is marked, false every time after. Must be atomic. */
  markUsed(receiptId: bigint): Promise<boolean>;
}

/** ponytail: one process, lost on restart. Use a database-backed store for anything deployed. */
export function memoryReceiptStore(): ReceiptStore {
  const used = new Set<bigint>();
  return {
    async markUsed(id) {
      if (used.has(id)) return false;
      used.add(id);
      return true;
    },
  };
}

export interface PaywallOptions {
  /** Supplies the chain client and the Grounded addresses; no wallet needed. */
  grounded: Grounded;
  /** The ERC-8004 agent this route belongs to. Payments go to its registered payout wallet. */
  agentId: bigint | number | string;
  /** Decimal token units per request, e.g. "0.05". The router's floor is 0.01. */
  price: string;
  store: ReceiptStore;
}

/** The slice of a Hono context this needs, so the SDK does not depend on Hono. */
export interface PaywallContext {
  req: { raw: Request };
}

/**
 * Hono-style middleware for the `grounded-router` 402 scheme (TRD §6). Unpaid requests get a 402
 * naming the router; a retry passes only if its `X-GROUNDED-RECEIPT` is fresh, signed by the
 * receipt's payer, for this route, for a receipt that paid this agent enough, and not used before.
 */
export function groundedPaywall(opts: PaywallOptions) {
  const { grounded } = opts;
  const agentId = agentIdSchema.parse(opts.agentId);
  // A price under the router's floor would take the buyer's approval and then revert every time.
  const price = amountSchema.parse(opts.price);
  const usdc = grounded.address("usdc");
  const registry = grounded.address("receiptRegistry");

  // Read once, on the first request, so constructing the middleware stays synchronous.
  let chain: Promise<{ chainId: number; amount: bigint }> | undefined;
  const chainInfo = () =>
    (chain ??= Promise.all([
      grounded.publicClient.getChainId(),
      grounded.publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "decimals" }),
    ])
      .then(([chainId, decimals]) => ({ chainId, amount: parseUnits(price, decimals) }))
      .catch((e) => {
        chain = undefined; // a flaky RPC on the first request must not break every later one
        throw e;
      }));

  const paymentRequired = async (error?: string) => {
    const { chainId, amount } = await chainInfo();
    const body: PaymentRequired = {
      x402Version: 1,
      accepts: [
        {
          scheme: SCHEME,
          network: `eip155:${chainId}`,
          asset: usdc,
          amount: amount.toString(),
          payTo: grounded.address("receiptRouter"),
          extra: { agentId: agentId.toString(), receiptRegistry: registry },
        },
      ],
      ...(error ? { error } : {}),
    };
    return Response.json(body, { status: 402 });
  };

  /** Null when the request may pass, otherwise why not. The store is touched last, only on success. */
  const refusal = async (req: Request, header: string): Promise<string | null> => {
    let access;
    try {
      access = decodeAccess(header);
    } catch {
      return `malformed ${RECEIPT_HEADER}`;
    }
    if (Math.abs(Date.now() / 1000 - access.iat) > ACCESS_MAX_AGE_SEC) return "access signature expired";
    if (access.method !== req.method.toUpperCase() || resourceOf(access.url) !== resourceOf(req.url)) {
      return "access signature is for a different request";
    }

    const { chainId, amount } = await chainInfo();
    // verifyTypedData, not recover: a smart-account payer signs through ERC-1271.
    const signed = await grounded.publicClient.verifyTypedData({
      address: access.payer,
      signature: access.sig,
      ...accessTypedData(access, chainId, registry),
    }).catch(() => false);
    if (!signed) return "access signature is not from the payer";

    const r = await grounded.publicClient.readContract({
      address: registry,
      abi: receiptRegistryAbi,
      functionName: "get",
      args: [access.receiptId],
    });
    // Consumed is fine: rating a receipt does not take back what it paid for.
    if (r.status !== ReceiptStatus.Issued && r.status !== ReceiptStatus.Consumed) return "no such receipt";
    if (!isAddressEqual(r.payer, access.payer)) return "receipt was paid by someone else";
    if (r.agentId !== agentId) return "receipt paid a different agent";
    if (!isAddressEqual(r.token, usdc) || r.amount < amount) return "receipt paid less than the price";

    if (!(await opts.store.markUsed(access.receiptId))) return "receipt already used";
    return null;
  };

  return async (c: PaywallContext, next: () => Promise<void>): Promise<Response | void> => {
    const header = c.req.raw.headers.get(RECEIPT_HEADER);
    if (!header) return paymentRequired();
    const why = await refusal(c.req.raw, header);
    if (why) return paymentRequired(why);
    await next();
  };
}

export { RECEIPT_HEADER, SCHEME } from "./x402.js";
