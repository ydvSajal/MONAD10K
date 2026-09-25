# Submission copy

Ready-to-paste text for the Monad Metropolis entry. Placeholder now, final on 12 Oct.
Keep this file in sync with what was actually submitted — note the date each time.

- **Repo:** https://github.com/ydvSajal/MONAD10K (currently **private**: must be public or shared with the judge address before submitting)
- **Judge access to grant:** `metropolis@hackathon.monad.xyz`
- **Chain:** Monad Testnet, 10143
- **Submitted:** _not yet — placeholder pending_

## Name

**Grounded**

## One-liner (under 100 chars)

Payment-grounded reputation for ERC-8004 agents: a rating counts only if the reviewer paid.

## Short description (about 50 words)

Agent reputation today is self-attested, so the cheapest attack is spraying fake reviews from
throwaway wallets. Grounded only counts a rating when the chain can prove the rater was a paying
customer, signed with a passkey verified onchain. The score is a public contract view anyone can
recompute.

## Longer description (about 150 words)

ERC-8004 gives agents a shared place to store feedback, but it does not say which feedback deserves
belief. Anyone can write anything about anyone.

Grounded adds the missing precondition. A reviewer pays the agent through `ReceiptRouter`, which
issues a receipt. That receipt buys exactly one rating, signed with a passkey bound to the reviewer's
address and verified onchain through Monad's P256 precompile. The score is a weighted median over a
21-bucket histogram, where payment size is weighted by log2 and capped, so spending a thousand times
more buys four times the vote rather than a thousand.

Ratings are not permanent by default: if a reviewer revokes their ERC-8004 feedback, anyone can call
`sweepRevoked` to remove it from the score. No contract in the system has an owner, admin, pauser or
upgrade path.

Consumers read one function, `meets(agentId, minScore, minReviewers)`, or one SDK call.

## Tags

`erc-8004` `agents` `reputation` `payments` `passkeys` `webauthn` `p256` `monad` `x402`

## Tracks / bounties to tick

Fill in against the official list when submitting. Only where genuinely load-bearing
(ground rule 12): **Monad main track.** As of 26 Sep **Envio is not built** (the explorer reads `getLogs`
and the indexer needs a real deploy) and **Privy is not used** (the playground was cut), so tick neither
unless that changes. Do **not** tick a sponsor whose SDK is not actually carrying weight in the product.

## Links

| What | URL |
|---|---|
| Repo | https://github.com/ydvSajal/MONAD10K |
| Web app + docs | https://monad-10-k.vercel.app (explorer and `/docs`; says "not deployed yet" until the testnet deploy) |
| Demo video | _Ship week, 7 Oct_ |
| Pitch video | _Ship week, 8 Oct_ |
| Contract addresses | _after deploy; will live in `deployments/10143.json`_ |

## What to say about status, honestly

At placeholder time the contracts are built and tested but not yet deployed. Say that plainly rather
than implying a live deployment. The honest version still sounds strong: passkey verification is
proven against the live precompile, and the full rating path is tested against the live ERC-8004
registries on testnet.

**Update 26 Sep:** the SDK, 402 paywall, demo seller/buyer, seed data, explorer, read API and docs are all
built, and the full demo (a buyer pays an honest agent and refuses a Sybil-inflated one, raw ERC-8004 87 vs
grounded 20) was run from a clean clone on a fork of Monad testnet. Still true: **nothing is deployed to
testnet yet**, the SDK is not on npm, and the passkey playground was cut. Say all three.
