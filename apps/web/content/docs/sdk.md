# SDK reference

`@sajalydv/grounded-sdk` is TypeScript on top of [viem](https://viem.sh). ESM and CJS builds, no framework dependency.
Not on npm yet: build it from the repository (`pnpm --filter @sajalydv/grounded-sdk build`).

```ts
import { Grounded, SoftwareAuthenticator, monadTestnet } from "@sajalydv/grounded-sdk";
import { groundedPaywall, memoryReceiptStore } from "@sajalydv/grounded-sdk/server"; // seller side
```

## `new Grounded(config)`

| Field | Type | |
|---|---|---|
| `chain` | `"monad-testnet"` | Required. |
| `rpcUrl` | `string` | Defaults to the public Monad testnet RPC. |
| `addresses` | `Partial<Addresses>` | Grounded's contract addresses, e.g. the contents of `deployments/10143.json`. The ERC-8004 registries and USDC are built in. Anything missing throws `NotDeployedError` rather than guessing. |
| `walletClient` | viem `WalletClient` | Needed only for calls that send a transaction. |
| `publicClient` | viem `PublicClient` | Bring your own instead of `rpcUrl`. |

## Reading

Reads need no wallet. `agentId` is a `bigint`, `number` or numeric `string`.

### `score(agentId): Promise<ScoreResult>`

| Field | |
|---|---|
| `score` | Weighted median of grounded ratings, 0-100. `0` when there are none: check `confidence`. |
| `rawScore` | ERC-8004's own average over the `quality` tag, paid or not. `null` if the agent has no feedback or the read fails. Advisory only: never used for a trust decision. |
| `reviewers` | Live grounded ratings counting toward the score. |
| `receipts` | Receipts consumed by grounded ratings. |
| `paid` | USDC in those receipts, as a decimal string. It is not everything paid through the router: a receipt nobody rated with is not counted. |
| `confidence` | `"none"` (nobody rated: unknown, not bad), `"low"` (fewer than 5 reviewers), `"ok"`. |
| `updatedAt`, `ownerChangedAt` | `Date` or `null`. `ownerChangedAt` moves on the next rating after a transfer, not at the transfer. |
| `disputes` | Count of `dispute`-tagged ratings. They are counted and never scored. |

### `check(agentId, policy): Promise<CheckResult>`

`policy = { minScore, minReviewers, ratingsAfterOwnerChange? }`. Returns `{ pass, reasons, score }` with one
`reasons` line per failed condition, so you can tell "too new" from "actually bad". An unrated agent fails only
a policy that asks for reviewers: `minReviewers: 0` opts in to new agents. With `ratingsAfterOwnerChange:
false`, an agent sold since it was rated fails, even before anyone rates it again (it compares `lastOwnerOf`
with `ownerOf`).

### `assertTrusted(agentId, policy): Promise<ScoreResult>`

`check`, but throws `UntrustedAgentError` (with `.agentId` and `.reasons`) instead of returning.

### `payoutWallet(agentId): Promise<Address | null>`

The wallet the router would pay, or `null`. `null` means nobody consented to be paid, and `pay` on that agent
throws `AgentNotPayableError`.

### `rawScore(agentId): Promise<number | null>`

The comparison figure on its own. Returns `null` rather than throwing, including when an agent has so many
feedback clients that the read is too large to serve.

## Paying and rating

These send transactions and need a `walletClient` with an account (`NoWalletError` otherwise). Every write uses
the measured gas estimate times 1.15, because Monad charges the gas **limit**, not the gas used.

### `pay({ agentId, amount, token?, mode? }): Promise<{ receiptId, txHash }>`

Pays the agent's payout wallet through `ReceiptRouter` and returns the receipt. `amount` is a plain decimal
string such as `"0.05"`, at least `"0.01"`. `mode`:

- `"transfer"` (default): approves the router if needed, then `pay`. Two transactions the first time.
- `"authorization"`: signs an EIP-3009 `ReceiveWithAuthorization` naming the router as payee, then
  `payWithAuthorization`. One transaction. Only the router can redeem it, and only for this agent.

### `bindPasskey(authenticator): Promise<Hex>`

Binds a passkey to your address in `ReviewerRegistry`. Once per reviewer. Rebinding replaces the key.

### `rate({ receiptId, score, tag?, authenticator, deadlineSec? }): Promise<{ feedbackTx, groundTx, feedbackIndex }>`

1. Dry-runs the grounding, so a rating that could not count is refused **before** feedback is posted.
   ERC-8004 feedback is public and permanent: posting it and then failing to ground it would leave an orphan.
2. Posts ERC-8004 `giveFeedback` from your address (`score` 0-100, `tag` `"quality"` or `"dispute"`).
3. Signs the exact score with your passkey and calls `ground`.

`deadlineSec` is how long the passkey signature stays valid (default 600, at most 86,400). If step 3 fails
after step 2, `GroundFailedError` carries `feedbackIndex` and `feedbackTx`, and `groundFeedback({ receiptId,
feedbackIndex, ... })` retries only that step.

Grounded never posts feedback for anyone else and never calls `giveFeedback` on your behalf.

## Selling and buying over HTTP

### `withTrust(fetch, { minScore, minReviewers, maxAmount, mode?, ratingsAfterOwnerChange? }): typeof fetch`

Returns a `fetch` that answers a `grounded-router` 402 by itself: read the offer, check the agent against the
policy, refuse over `maxAmount`, pay through the router, retry with a signed receipt. Other responses,
including 402s in another scheme, come back untouched. `maxAmount` is required: the seller names the price, so
you name a ceiling.

If the seller still answers 402 after payment and three retries (its RPC can be a block behind yours),
`PaymentNotAcceptedError` carries the `receiptId` so you can retry later.

### `groundedPaywall({ grounded, agentId, price, store })` from `@sajalydv/grounded-sdk/server`

Hono-style middleware for sellers. See the [402 scheme](/docs/402-scheme). `memoryReceiptStore()` is enough
for one process; use a database-backed `ReceiptStore` (`markUsed(receiptId): Promise<boolean>`) if you restart
or run more than one instance, or a restart lets a receipt be replayed.

## Authenticators

```ts
interface Authenticator {
  publicKey(): Promise<{ qx: bigint; qy: bigint }>;
  sign(challenge: Hex): Promise<WebAuthnSig>;
}
```

`SoftwareAuthenticator.random(rpId)` is an in-memory P-256 passkey for scripts and agents with no browser. Pass
the same `rpId` the contracts were deployed with (`rpId` in `deployments/10143.json`).

`BrowserPasskey` is a real WebAuthn passkey in the browser (Touch ID, Windows Hello, a phone, a security key),
built on `ox`. `BrowserPasskey.create({ rpId, name })` prompts the user; `toJSON()` and `BrowserPasskey.restore()`
keep the credential id and public key between visits. It requires user verification, folds `s` to the low half
of the curve (the contract rejects the other half, and hardware authenticators return either), and only works on
a secure origin whose host matches `rpId`.

## Errors

All extend `GroundedError`.

| Error | When |
|---|---|
| `UntrustedAgentError` | The agent failed the policy. `.agentId`, `.reasons`. |
| `NotDeployedError` | An address you did not supply and the SDK does not know. |
| `AgentNotPayableError` | The agent has no payout wallet, so payments to it would revert. Its owner must call `setAgentWallet`. |
| `NoPasskeyBoundError` | `rate` before `bindPasskey`. |
| `ReceiptAlreadyUsedError` | The receipt already bought a rating. |
| `ContractRevertError` | A Grounded contract reverted. `.errorName`, `.args`. |
| `GroundFailedError` | Feedback posted, grounding failed. Retry with `groundFeedback`. |
| `PaymentNotAcceptedError` | Paid, but the seller kept answering 402. `.receiptId`. |
| `NoWalletError` | A write without a `walletClient` account. |
