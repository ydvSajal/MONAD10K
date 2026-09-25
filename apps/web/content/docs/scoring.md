# Scoring spec

The score is computed **onchain**, by `GroundedReputation.scoreOf`, from a 21-bucket histogram. There is no
offchain recompute and no trusted party: the SDK, the explorer and this page only read it.

## Constants

| Constant | Value | Where |
|---|---|---|
| Buckets | 21 (scores 0, 5, 10, ... 100) | `ScoringLib.BUCKETS` |
| Bucket size | 5 | `ScoringLib.BUCKET_SIZE` |
| Weight cap | 4 | `ScoringLib.WEIGHT_CAP` |
| Weight unit | 0.10 USDC (`100_000` at 6 decimals) | `ScoringLib.WEIGHT_UNIT_6DP` |
| "Low confidence" below | 5 live reviewers | `ScoringLib.MIN_REVIEWERS_OK` (the SDK's `confidence`) |
| Minimum payment | 0.01 USDC (`10_000` at 6 decimals) | `ReceiptRouter.MIN_AMOUNT_6DP` |
| Receipt lifetime | 30 days | `ReceiptRegistry.RECEIPT_TTL` |
| Rating scale | integer 0-100, tag `quality` | ERC-8004 feedback, `valueDecimals == 0` |

## What counts as a rating

A rating counts only if **all** of these hold when `ground` runs:

1. The deadline has not passed.
2. The receipt exists, is unused, and is under 30 days old.
3. The caller is the receipt's payer.
4. The caller is not the agent's owner, approved operator, operator-for-all, or payout wallet.
5. The caller's ERC-8004 feedback at `feedbackIndex` exists, is not revoked, has `valueDecimals == 0`, a value
   in 0-100, and tag `quality` (or `dispute`).
6. The caller has a bound passkey, and it signed exactly this receipt, agent, feedback index, score, whether
   it is a dispute, reviewer and deadline (EIP-712, verified onchain through the P256 precompile).

Each check has its own custom error. See [Contracts](/docs/contracts).

## Weight: what you paid

`weight = min(1 + floor(log2(1 + floor(paid / 0.10 USDC))), 4)`

| Paid (USDC) | Weight |
|---|---|
| 0.01 - 0.09 | 1 |
| 0.10 - 0.29 | 2 |
| 0.30 - 0.69 | 3 |
| 0.70 and up | 4 |

Logarithmic and capped on purpose: paying 1,000 times more buys 4 times the vote, not 1,000 times.
Non-USDC tokens are normalised to 6 decimals first.

## Bucket

`bucket = floor((score + 2) / 5)`, so scores round to the nearest multiple of 5, halves up. 22 lands in bucket
4 (20), 28 in bucket 6 (30), 3 in bucket 1 (5).

## Score: weighted median

Each reviewer has **one live rating per agent**. Adding weight `w` to bucket `b` for each live rating gives a
histogram; `mass` is the total weight. The score is the value of the **first bucket whose cumulative weight
reaches half the mass**:

```
cumulative(i) * 2 >= mass   ->   score = i * 5
```

So the score is always a multiple of 5, and on an exact tie it takes the lower bucket. Worked example: two
reviewers, weight 2 each, rating 22 and 28. Buckets 20 and 30, mass 4. Bucket 20 has cumulative 2, and
`2 * 2 >= 4`, so the score is **20**.

An agent with no live ratings has mass 0 and score 0. That 0 means "unknown", not "bad": read `confidence`.

## Replacing and removing ratings

- **Rating again** replaces the reviewer's previous live rating. Paying twice never doubles a vote. The new
  receipt is still consumed.
- **`dispute`-tagged** ratings are counted in `disputes` and never move the score.
- **Revoking** the ERC-8004 feedback does not remove a grounded rating by itself. Anyone may call
  `sweepRevoked(agentId, reviewer)`: it re-reads the registry and removes the rating if, and only if, it is
  now revoked. Until someone does, a revoked rating still counts.
- **Trimming is deliberately absent.** Dropping equal weight from both tails cannot move a weighted median, so
  it would only cost gas.

## Reading it

| Call | Returns |
|---|---|
| `scoreOf(agentId)` | `median`, `reviewers`, `receipts`, `paid`, `weightMass`, `updatedAt`, `ownerChangedAt` |
| `meets(agentId, minScore, minReviewers)` | `true` when `reviewers >= minReviewers` **and** `median >= minScore` |
| `liveRating(agentId, reviewer)` | that reviewer's `bucket`, `weight`, `feedbackIndex`, `isDispute`, `exists` |
| `disputeCount(agentId)` | count of `dispute` ratings |
| `lastOwnerOf(agentId)` | owner at the agent's last grounded rating |

`meets` is O(21) and callable from another contract; see `GroundedGate`.

## Two quirks worth knowing

- **`ownerChangedAt` is lazy.** It moves on the next rating after a transfer, not at the transfer. To catch a
  sale since the last rating, compare `lastOwnerOf` with the registry's `ownerOf`. `check` with
  `ratingsAfterOwnerChange: false` does this for you.
- **`paid` and `receipts` count only receipts spent on ratings.** A payment nobody rated with is in the
  `ReceiptIssued` events, not in `scoreOf`. `paid` also saturates at the largest `uint40` (about 1.1 million
  USDC), because it is a display figure and must not be able to block grounding.
