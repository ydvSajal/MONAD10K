# Threat model

What Grounded stops, what it only dampens, and what it does not stop. The last part is the one that matters.

## What it is trying to do

Make a rating expensive to fake: a rating counts only if the reviewer **paid the agent onchain**, the rating is
signed by a passkey bound to the reviewer's address, and the score is computed by a contract nobody controls.

## Stopped

| Attack | What stops it |
|---|---|
| Five-star spam from throwaway wallets | Each rating needs a real payment to the agent's own payout wallet, through the router. |
| Buying a score cheaply | Weight is logarithmic in what was paid and capped at 4: 1,000 times the money is 4 times the vote. |
| One reviewer, many votes | One live rating per reviewer per agent. A new rating replaces the old one. |
| Reusing one payment | A receipt is spent by its first rating, and expires after 30 days. |
| Someone else rating on your receipt | `ground` requires the caller to be the receipt's payer, and a passkey signature over the exact score. |
| Replaying a signed rating | The signature covers the receipt, agent, feedback index, score, reviewer and deadline, in a chain-bound EIP-712 domain, and the receipt is single-use. |
| Front-running a signed payment authorization | The authorization names the router as payee and only the payee can redeem it; its nonce is bound to the agent. Fork-tested against the live USDC. |
| Owner rating their own agent from a linked address | The agent's owner, approved operator, operator-for-all and payout wallet cannot ground a rating (`ExcludedReviewer`). |
| Outliers dragging the score | Weighted median, not a mean. |
| Rate, then revoke the evidence | `sweepRevoked` is permissionless and removes a rating whose ERC-8004 feedback was revoked. |
| Reading a stale rating after a sale | `lastOwnerOf` and `ownerChangedAt` let a consumer refuse ratings earned under a previous owner. |
| A paywalled receipt used by a stranger | The 402 access header is signed by the payer, for one URL and method, and expires in 120 seconds. |
| A privileged key rewriting scores | None exists: no owner, admin, pauser or upgrade path in any Grounded contract. |

## Not stopped

**Wash rating is not solved.** An agent's owner can rate it from a fresh wallet that is not linked to the
agent onchain. The exclusions only catch addresses the registry links to the agent. The payment also lands in
the agent's own payout wallet, so the owner gets the money back: the real cost of self-rating is gas and the
float, not the amount paid.

What Grounded does about it, honestly:

- The weight cap means a big payment does not buy a bigger vote.
- One live rating per reviewer means each fake identity is one vote, and each needs a bound passkey and a
  receipt.
- The explorer shows **distinct payers next to total paid**, so an agent with 40 ratings from 2 payers reads as
  exactly that.
- Consumers choose `minReviewers`. Requiring five paying reviewers costs a wash-rater five wallets, not one.

Payment-grounding stops strangers spraying reviews at an agent. It does not stop an agent reviewing itself
through wallets it controls.

## Known limitations

- **A passkey is not proof of personhood.** The contract cannot tell a hardware key from a software one and is
  not meant to. Sybil resistance comes from the payments, not the keys. Passkeys make a rating a deliberate,
  signed act bound to an address.
- **Key rotation does not need the old passkey.** `bind` is signed by the new key. Whoever controls the
  reviewer's wallet can rebind it to a new passkey. The passkey is therefore not an independent second factor
  for that wallet.
- **A revoked rating counts until someone sweeps it.** Bounded and visible, and anyone can fix it, but the
  score can lag.
- **`ownerChangedAt` is lazy.** It moves on the next rating after a transfer. Use `lastOwnerOf` (the SDK's
  `check` does) to catch a sale in between.
- **The score is quantised to multiples of 5** and takes the lower bucket on an exact tie.
- **Privacy.** Reviewers, receipts and amounts are public onchain. Use a dedicated rating wallet if you do not
  want a rating linked to your other activity. Zero-knowledge receipts are on the roadmap, not built.
- **Unrated is not bad.** A new agent has no score. `confidence: "none"` means unknown, and the SDK's `check`
  treats it that way unless your policy demands reviewers.

## What we trust

| Dependency | Assumption | If it fails |
|---|---|---|
| ERC-8004 Identity and Reputation registries | Correct, and honest about ownership and feedback. **They are upgradeable and owned by their deployer.** Not our key, but a trust assumption. | An upgrade that lies about `ownerOf` or feedback could feed us false inputs. The adapter is one small library, `Erc8004Adapter`, so only one file knows the registry's shape. |
| USDC (Circle proxy) | A normal ERC-20 with EIP-3009. | Payments and receipts depend on it. |
| Monad's P-256 precompile (`0x0100`) | Verifies signatures correctly. Checked live with a real signature. | Passkey binding and grounding stop working. |
| The WebAuthn relying party (`rpId`) | The domain the passkeys are scoped to. | Changing it means a redeploy; reviewer bindings do not carry over. |

## Not audited

These contracts have unit, fuzz, invariant and live-fork tests and a static-analysis pass, and have not had a
third-party audit. Testnet only.
