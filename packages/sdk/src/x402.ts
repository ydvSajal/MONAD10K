import { z } from "zod";
import type { Address, Hex } from "viem";

/** The 402 scheme and retry header both sides speak (TRD §6). */
export const SCHEME = "grounded-router";
export const RECEIPT_HEADER = "X-GROUNDED-RECEIPT";
/** How old a signed access header may be, either direction, before the seller refuses it. */
export const ACCESS_MAX_AGE_SEC = 120;

export interface Offer {
  scheme: typeof SCHEME;
  /** CAIP-2, e.g. `eip155:10143`. */
  network: string;
  asset: Address;
  /** Base units of `asset`, as a decimal string. */
  amount: string;
  /** The ReceiptRouter, never the agent: paying the router is what mints the receipt. */
  payTo: Address;
  extra: { agentId: string; receiptRegistry: Address };
}

export interface PaymentRequired {
  x402Version: 1;
  accepts: Offer[];
  error?: string;
}

/** What the buyer proves in the retry: "I paid receipt N, and I am the payer asking for this URL". */
export interface Access {
  receiptId: bigint;
  payer: Address;
  url: string;
  method: string;
  iat: number;
  sig: Hex;
}

/** EIP-712 for `Access.sig`. Bound to the registry so a header cannot move between deployments. */
export function accessTypedData(a: Omit<Access, "payer" | "sig">, chainId: number, receiptRegistry: Address) {
  return {
    domain: { name: "Grounded 402", version: "1", chainId, verifyingContract: receiptRegistry },
    types: {
      Access: [
        { name: "receiptId", type: "uint256" },
        { name: "url", type: "string" },
        { name: "method", type: "string" },
        { name: "iat", type: "uint64" },
      ],
    },
    primaryType: "Access",
    message: { receiptId: a.receiptId, url: a.url, method: a.method, iat: BigInt(a.iat) },
  } as const;
}

// URL.href is ASCII, and so is everything else in here, so btoa/atob are safe and work everywhere.
export function encodeAccess(a: Access): string {
  return btoa(JSON.stringify({ ...a, receiptId: a.receiptId.toString() }));
}

const accessSchema = z.object({
  receiptId: z.coerce.bigint().positive(),
  payer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  url: z.string().url(),
  method: z.string().min(1),
  iat: z.number().int().nonnegative(),
  sig: z.string().regex(/^0x[0-9a-fA-F]*$/),
});

/** Throws on anything malformed: this parses a header from whoever is asking. */
export function decodeAccess(header: string): Access {
  return accessSchema.parse(JSON.parse(atob(header))) as Access;
}

/**
 * What the signed URL must match. Path and query only: host and scheme change behind proxies, and
 * a header replayed at another seller fails anyway, because the receipt names a different agent.
 */
export function resourceOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}
