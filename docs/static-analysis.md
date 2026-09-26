# Static analysis

Run 26 Sep against `contracts/src` at `main`. PRD target: no critical or high finding open. Every finding
below is triaged, none is open. Slither and Aderyn are run by hand, not in CI (CI runs `forge fmt`, `forge test` and gitleaks).

```bash
cd contracts
slither . --exclude-dependencies --exclude-informational --exclude-low     # 3 medium, all false positives
aderyn . -s src -o report.md                                               # 2 "high", both false positives
forge coverage --ir-minimum --report summary                               # coverage; plain `forge coverage` hits stack-too-deep in OZ P256
```

## Slither (medium and above): 3 findings, 0 real

| Finding | Where | Verdict |
|---|---|---|
| `uninitialized-local` | `GroundedReputation._record`, local `bucket` | False positive. It is deliberately left at its default `0` for a dispute rating, which is stored with bucket 0 and never enters the histogram. |
| `unused-return` (x2) | `Erc8004Adapter.readRating` / `isRevoked` | False positive. `readFeedback` returns five values and each function reads the ones it needs; the rest are ignored by destructuring. |

## Aderyn (high): 2 findings, 0 real

| Finding | Where | Verdict |
|---|---|---|
| H-1 "state change after external call" | `GroundedReputation` constructor (line 102), `ReceiptRouter` constructor (line 44) | False positive. Both are constructor-time `view` calls (`RP_ID_HASH()`, `RECEIPT_TTL()`, `decimals()`) whose results are written to immutables or a mapping. A `view` call is a `STATICCALL`, so it cannot re-enter, and a contract under construction has no code to re-enter. |
| H-2 "unsafe casting" | `ReceiptRouter._issue`, `uint96(value)` | Guarded. `_check()` reverts `AmountTooLarge` for anything above `type(uint96).max` before this line, and the site carries a comment saying so. |

Aderyn's low findings (large numeric literal, literal instead of constant, public function not used
internally, modifier used once, unspecific pragma, `PUSH0`) are style notes. `PUSH0` is intended: the target
chain supports it (`evm_version = "cancun"`).

## Tests

| Layer | State |
|---|---|
| Unit, fuzz, invariant | 74 passing (`forge test`), every threat mapped to a test or a doc note in `docs/threat-tests.md`, including an invariant that the score always equals the weighted median of the live ratings and that counters add up, under random pay / rate / dispute / replace / revoke / sweep traffic (256 runs, 8,192 calls; it fails immediately if the replace path is broken) |
| Live fork | 6 passing (`MONAD_FORK_RPC=... forge test -n monad`) |
| Line coverage, `src/` | `GroundedReputation` 96.7%, `ScoringLib` 92.3%, every other contract 100% |
| Formatting | `forge fmt --check` in CI |
| Secrets | gitleaks in CI on every push and PR. Full history (`gitleaks git --log-opts="--all"`, 26 Sep): **no leaks**. A scan of the working tree flags one tracked line, `PRIVY_APP_SECRET=` (an empty variable name in an env template in `grounded-docs/06-INTEGRATIONS.md`, ruled a false positive and fingerprinted in `.gitleaksignore`), plus Next.js build caches in the ignored `.next/` folder |

Not audited by a third party. Testnet only.
