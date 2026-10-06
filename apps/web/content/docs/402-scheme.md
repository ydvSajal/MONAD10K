# 402 scheme: `grounded-router`

How a seller charges per request and a buyer pays without a human in the loop, while the payment still lands as
a **receipt** that can back a rating. It follows the shape of x402 (`402` plus an `accepts` list), with one
difference: the payee is Grounded's `ReceiptRouter`, not the agent. Paying the router is what mints the
receipt, and the router forwards the money to the agent's payout wallet in the same transaction.

There is no offchain facilitator. Settlement is the router contract.

## 1. Unpaid request

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "grounded-router",
    "network": "eip155:10143",
    "asset": "<USDC address>",
    "amount": "50000",
    "payTo": "<ReceiptRouter address>",
    "extra": { "agentId": "12", "receiptRegistry": "<ReceiptRegistry address>" }
  }]
}
```

`amount` is in token base units (`50000` is 0.05 USDC). `payTo` is always the router.

## 2. Buyer pays

The buyer calls `ReceiptRouter.pay(agentId, asset, amount)` (or signs a `ReceiveWithAuthorization` and has
`payWithAuthorization` relayed). The result is a `receiptId`.

## 3. Retry with proof

```
X-GROUNDED-RECEIPT: base64(json{ receiptId, payer, url, method, iat, sig })
```

`sig` is the payer's EIP-712 signature over `{ receiptId, url, method, iat }`, in the domain
`{ name: "Grounded 402", version: "1", chainId, verifyingContract: <ReceiptRegistry> }`. A header therefore
cannot move between deployments, URLs or methods, and a `receiptId` on its own is worthless to anyone but the
payer.

## 4. Seller checks

`groundedPaywall` refuses unless all of these hold, and answers `402` with an `error` saying which failed:

1. The header decodes.
2. `iat` is within 120 seconds of now.
3. `method` and the URL (path and query) match this request.
4. `sig` is valid for `payer`. Checked with `verifyTypedData`, so smart-account payers (ERC-1271) work.
5. The receipt exists (status `Issued` or `Consumed`: rating a receipt does not take back what it paid for),
   was paid by `payer`, paid **this** agent, in the right token, for at least the price.
6. The receipt has not been used before. `store.markUsed(receiptId)` must return `true`.

The store is touched last, only when everything else passed, so a bad request cannot burn a good receipt.
**One receipt buys one request.**

## Seller

```ts
import { Hono } from "hono";
import { Grounded } from "@sajalydv/grounded-sdk";
import { groundedPaywall, memoryReceiptStore } from "@sajalydv/grounded-sdk/server";

const grounded = new Grounded({ chain: "monad-testnet", addresses });
const app = new Hono();
app.get("/insight", groundedPaywall({ grounded, agentId: 12, price: "0.05", store: memoryReceiptStore() }),
  (c) => c.json({ answer: "..." }));
```

- `price` must be at least `"0.01"`, the router's floor; a lower price would fail every payment, so it is
  rejected at construction.
- The agent must have a payout wallet (`getAgentWallet`), or buyers' payments revert.
- `memoryReceiptStore` forgets on restart, which lets a receipt be replayed. Use a database for anything real.
- The seller reads receipts from its own RPC node, which can be a block behind the buyer's. The SDK's buyer
  retries for that reason.

## Buyer

```ts
const buy = grounded.withTrust(fetch, { minScore: 70, minReviewers: 1, maxAmount: "0.10" });
const res = await buy("https://seller.example/insight");
```

`withTrust` does steps 2 and 3 itself, after checking the seller's agent against your policy and your
`maxAmount`. A 402 in any other scheme is returned untouched.

## What this does not do

It does not prove the response was any good. That is what the rating afterwards is for: the receipt that
bought the answer can back a rating of it.
