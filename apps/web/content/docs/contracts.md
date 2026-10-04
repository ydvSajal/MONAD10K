# Contracts

Four contracts plus a helper, Solidity 0.8.28, EVM `cancun`, on Monad Testnet (chain 10143). **None has an
owner, admin, pauser or upgrade path.** Configuration is `immutable` or `constant`, set once at construction.
Every state change emits an event. Custom errors only.

> **Deployed on Monad Testnet** (4 Oct 2026, block 68082112, rpId `grounded.sajal.sbs`). Addresses are in
> `deployments/10143.json` and are the SDK's defaults:
>
> | Contract | Address |
> |---|---|
> | `ReviewerRegistry` | `0xFb38DcB72C222d3943579b4F2c4C91ebcBE4eBa6` |
> | `ReceiptRegistry` | `0xa89b76Ea9AcEA12A66Fb23d318219b9119362301` |
> | `ReceiptRouter` | `0xab442c3cbc2997a6218FEA0DD253c3717edfc62e` |
> | `GroundedReputation` | `0xaDDd1f2F876CD253C57177b675905Bdb0061bF82` |

They sit on top of two contracts we did not write and do not control: the ERC-8004 Identity and Reputation
registries, and USDC (see [Threat model](/docs/threat-model)).

| Contract | Job |
|---|---|
| `ReceiptRouter` | Takes a payment, forwards it to the agent's payout wallet, and issues a receipt. Holds no funds. |
| `ReceiptRegistry` | Stores receipts. Only the router can create one; only `GroundedReputation` can spend one. |
| `ReviewerRegistry` | Binds one passkey (P-256 public key) to each reviewer address. |
| `GroundedReputation` | Turns a paid receipt plus an ERC-8004 feedback entry into a counted rating; computes the score. |
| `GroundedGate` | Abstract helper: `onlyTrusted(agentId)` for contracts that should only serve trusted agents. |

## Existing contracts we use (Monad Testnet)

| | Address |
|---|---|
| ERC-8004 Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| USDC (6 decimals) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| P-256 precompile | `0x0100` |

## `ReceiptRouter`

- `pay(agentId, token, value) -> receiptId`: transfers `value` from the caller to the agent's payout wallet
  (`getAgentWallet`), then issues a receipt with the caller as payer.
- `payWithAuthorization(agentId, token, from, value, validAfter, validBefore, salt, signature) -> receiptId`:
  the payer signs an EIP-3009 **`ReceiveWithAuthorization`** naming the router as payee. Anyone may relay it;
  the receipt's payer is `from`, never the relayer. Only the payee can redeem a receive-authorization, so it
  cannot be front-run into the token (money moved, no receipt). Its nonce is
  `authorizationNonce(agentId, salt) = keccak256(abi.encode(agentId, salt))`, so it cannot be replayed against a
  different agent. Funds pass through the router within the call; it holds nothing afterwards.
- Allowed tokens are fixed at construction. Minimum payment is 0.01 USDC (`MIN_AMOUNT_6DP = 10_000`).
- Errors: `TokenNotAllowed(token)`, `AmountBelowMinimum(normalised6dp)`, `AmountTooLarge(value)` (more than
  `uint96`), `NoAgentWallet(agentId)`, `BadSignatureLength(length)`, `NoTokens()`,
  `InvalidRecipient(to)` (a payout wallet that is the router itself, which would lock funds).

## `ReceiptRegistry`

- `issue(receipt) -> id` (router only). Ids are sequential from 1.
- `consume(id)` (`GroundedReputation` only). Requires status `Issued` and age at most `RECEIPT_TTL` (30 days).
- `get(id)` returns `{ agentId, payer, token, amount, paidAt, status }`; `isValid(id)` is a boolean.
- Expiry is evaluated on read: nobody has to run a job to age a receipt out.
- Events: `ReceiptIssued(id, agentId, payer, token, amount)`, `ReceiptConsumed(id, agentId, payer)`.
- Errors: `NotRouter()`, `NotGrounded()`, `ReceiptNotIssued(id)`, `ReceiptExpired(id)`.

## `ReviewerRegistry`

- `bind(qx, qy, proof)`: the passkey `(qx, qy)` signs an EIP-712 `Bind(reviewer, qx, qy, nonce)` challenge,
  verified through the P-256 precompile with user verification required. A key can belong to one reviewer
  only.
- Calling `bind` again **rotates** the key. Only the *new* key signs the proof: the old key is not asked.
  See the [threat model](/docs/threat-model).
- Views: `keyOf(reviewer) -> (qx, qy)`, `reviewerOf(keyHash)`, `nonces(reviewer)`, `bindDigest(...)`.
- Constructor takes `rpIdHash = sha256(rpId)`, the WebAuthn relying party the passkey is scoped to. Changing
  the domain means redeploying, and reviewer bindings do not carry over.
- Event: `ReviewerBound(reviewer, keyHash, qx, qy)`. Errors: `BadSignature()`, `KeyAlreadyBound(keyHash)`.

## `GroundedReputation`

- `ground(receiptId, feedbackIndex, deadline, sig)`: the one write. Checks, cheapest first: deadline, receipt,
  payer, exclusions, ERC-8004 feedback, passkey, signature. Then it consumes the receipt, weights the rating
  by what was paid, and updates the histogram. See the [scoring spec](/docs/scoring).
- `sweepRevoked(agentId, reviewer)`: permissionless. Removes a rating whose feedback was revoked after it was
  grounded.
- Views: `scoreOf`, `meets`, `liveRating`, `disputeCount`, `lastOwnerOf`.
- Events: `Grounded(agentId, reviewer, receiptId, feedbackIndex, score, weight, isDispute)`,
  `Swept(agentId, reviewer, feedbackIndex)`, `OwnerChanged(agentId, previousOwner, newOwner)`.
- Errors: `Expired()`, `BadReceipt(receiptId)`, `NotPayer(payer)`, `ExcludedReviewer()`,
  `BadFeedback(feedbackIndex)`, `NoPasskey()`, `BadSignature()`, `NothingToSweep()`, `StillValid()`.

Two behaviours to expect from the live ERC-8004 registry: feedback indices are **1-based**, and reading an index
that does not exist **reverts** (`index must be > 0` / `index out of bounds`) rather than returning empty, so
`ground` on a bad index surfaces the registry's message, not `BadFeedback`. The SDK's `rate` dry-runs first for
exactly this reason.

## `GroundedGate`

```solidity
contract TrustedHiring is GroundedGate {
    constructor(IGroundedReputation g) GroundedGate(g, 70, 5) {}   // minScore 70, minReviewers 5, immutable

    function hire(uint256 agentId) external onlyTrusted(agentId) { /* ... */ }
}
```

`onlyTrusted(agentId)` reverts with `AgentNotTrusted(agentId)` unless `meets(agentId, minScore, minReviewers)`.
A worked example is in `contracts/src/examples/TrustedHiring.sol`.

## Gas

Measured on a fork with the live precompile and registries:

| Call | Gas used |
|---|---|
| `bind` | 147,597 |
| `pay` (after a one-off USDC `approve`, 86,716) | 301,673 |
| `payWithAuthorization` | 341,592 |
| `ground` (first rating / replacing one) | 342,718 / 268,281 |
| `sweepRevoked` | 107,735 |

Monad charges the gas **limit**, so the SDK sets each limit from an estimate times 1.15. About a third of
`ground` is exclusion and feedback reads into the ERC-8004 proxies. The full table, and how to reproduce it,
is in `docs/gas.md`.
