# Gas

Measured, not estimated: each row is the `gasUsed` of a real transaction on an anvil fork of Monad testnet
(26 Sep), with the live ERC-8004 registries, the live USDC and Monad's P-256 precompile underneath. Every call
is its own transaction, so storage starts cold, which is what a user pays. Reproduce with:

```bash
# fresh fork, Deploy.s.sol deployed (see the Quickstart), then
pnpm --filter @grounded/seed gas
```

| Transaction | Gas used | Notes |
|---|---|---|
| `bind` (first key) | 147,597 | P-256 verify through the precompile. Once per reviewer |
| USDC `approve` | 86,716 | Once, only for the `transfer` path |
| `pay` (transfer) | 301,673 | Router + receipt + two proxy reads + USDC transfer |
| `payWithAuthorization` | 341,592 | One transaction instead of approve + pay (86,716 + 301,673 = 388,389) |
| ERC-8004 `giveFeedback` | 271,327 | Not ours; the registry's cost |
| `ground` (first rating) | 342,718 | Includes exclusion checks and the feedback read |
| `ground` (replaces a rating) | 268,281 | Cheaper: the reviewer's slots are already warm |
| `sweepRevoked` | 107,735 | |

Reading a score is free: `scoreOf` and `meets` are views (`meets` is O(21) and costs a few thousand gas when
called from another contract).

## Things to know

- **Monad bills the gas limit, not the gas used.** The SDK sets every write's limit to `estimateGas` times 1.15,
  so a user pays about 15% over the table. It does not use static per-call limits (TRD §5's `gas.ts`), because
  an estimate cannot go stale when a registry is upgraded.
- **`ground` is over the 250k checkpoint** in the timeline (21 Sep). About 110k of it is four exclusion reads
  into the ERC-8004 identity proxy, and about 33k is `readFeedback`. Cutting the exclusion checks was tried and
  reverted: they are what stops an owner rating themselves. Revisit only with a cheaper way to read the same
  facts.
- **Unit-test gas is not comparable.** `forge test --gas-report` uses mock tokens and a Solidity fallback for
  P-256, so its `bind` reads about 370k and its `pay` about 170k. Those numbers are not what a user pays.
- Earlier drafts of the README and docs said `pay` costs about 155k. That figure came from the mock-token unit
  tests and was wrong; it is corrected everywhere.
