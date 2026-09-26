# Threat to test map

The timeline (3 Oct) asks that every threat has a test or a documented answer. The planning pack names only
some of the `T` numbers (T2, T4, T5, T6, T7, T9, T12), so this maps every threat it names in prose, with the
`T` number where there is one. Test names are in `contracts/test/` (`forge test`) unless marked otherwise.

| Threat | Answer | Evidence |
|---|---|---|
| Owner or linked address rates their own agent (T2) | Owner, approved operator, operator-for-all and payout wallet get `ExcludedReviewer` | `test_ground_revertsForAgentOwner`, `..ForApprovedOperator`, `..ForOperatorForAll`, `..ForTheAgentsOwnPayoutWallet`; seed script agent C on a fork |
| **Wash rating from an unlinked wallet (T2)** | **Not stopped.** Damped by weight cap, one live rating per reviewer, and distinct payers shown next to total paid | `/docs/threat-model`; `invariant_scoreEqualsMedianOfLiveRatings`; explorer agent page |
| Sybil spam of unpaid feedback | ERC-8004 feedback is ignored unless a paid receipt is grounded to it | Seed script agent B (raw 87, grounded 20); `test_ground_revertsForNonPayer` |
| Buying influence with money (T4) | Weight is `log2` of the payment, capped at 4 | `testFuzz_weightOf_neverExceedsCap`, `test_weightOf_matchesTable`, `test_median_weightBeatsCount` |
| Dust payments | Router floor of 0.01 USDC | `test_pay_revertsBelowDustFloor`, `testFuzz_payNeverKeepsFundsOrBreaksFloor` |
| Signature replay: same receipt (T5) | A receipt is consumed by its first rating | `test_ground_revertsOnSecondUseOfSameReceipt`, `invariant_receiptsAreConsumedAtMostOnce` |
| Signature replay: after the deadline (T5) | `deadline` is signed and checked first | `test_ground_revertsWhenExpired` |
| Signature replay: another chain (T5) | `chainId` is in the EIP-712 domain | `test_ground_revertsWhenReplayedOnAnotherChain` |
| Signature replay: a bind proof | Nonce bumps on every bind; proof bound to the caller | `test_bind_replayFailsAfterNonceBump`, `test_bind_proofIsBoundToCaller` |
| Signature used by another reviewer | Caller must be the receipt's payer, and the digest names the reviewer | `test_ground_revertsForNonPayer`, `test_bind_proofIsBoundToCaller` |
| Signature for a different score | The exact score is in the digest | `test_ground_revertsWhenSignatureCoversDifferentScore` |
| Signature malleability (T6) | `s` above half the curve order is rejected | `test_ground_revertsWhenSignatureIsHighS`, `test_bind_revertsWhenSignatureIsHighS`; the SDK folds `s` (`BrowserPasskey` unit test) |
| No user verification (T7) | The UV flag is required | `test_bind_revertsWhenUserVerificationMissing`, `test_ground_revertsWhenUserVerificationMissing` |
| Software passkeys (T7) | Not stopped, by design: the contract cannot tell them from hardware | `/docs/threat-model`, `/docs/faq`; `SoftwareAuthenticator` documents it |
| Wrong relying party | `rpIdHash` is checked against the authenticator data | `test_bind_revertsOnWrongRpId` |
| Expired receipt | 30 days, evaluated on read; the boundary second still counts | `test_ground_revertsWhenReceiptIsOlderThanTheTtl`, `test_ground_receiptIsStillGoodOnTheLastSecondOfTheTtl`, `test_consume_revertsAfterTtl`, `test_consume_allowedOnTtlBoundary` |
| Revoked feedback | `sweepRevoked` removes it; a revoked entry cannot be grounded | `test_sweepRevoked_*`, `test_ground_revertsWhenFeedbackRevokedBeforeGrounding`, `invariant_scoreEqualsMedianOfLiveRatings` |
| Identity transfer (agent sold) | `lastOwnerOf` and `ownerChangedAt`; the SDK's `check` can refuse | `test_ownerChangedAt_recordsLazilyOnNextRating`; SDK read tests |
| Front-running a signed payment | Receive-authorization to the router, nonce bound to the agent | `test_authorizationCannotBeRedeemedOutsideTheRouter`, `test_authorizationCannotBeRelayedToAnotherAgent` (fork, live USDC) |
| Router holds funds | It never does | `invariant_routerHoldsNothing` |
| Paywall: stolen receipt id | The access header must be signed by the payer | SDK fork test "a receipt id alone is worthless to anyone but its payer" |
| Paywall: one receipt, many requests | One request per receipt | SDK fork test "once per receipt" |
| Agent sold with no payout wallet | `pay` reverts `NoAgentWallet` | `test_pay_revertsWhenAgentHasNoWallet` |
| Privileged key rewrites scores (T12) | None exists: no owner, admin, pauser or upgrade path | Static: no such function in any contract; `/docs/contracts` |
| Privacy of reviewers (T9) | Not addressed: everything is public. Use a dedicated rating wallet; ZK receipts are roadmap | `/docs/threat-model` |
| Upgradeable ERC-8004 registries lie | A trust assumption, not ours to remove; the adapter is one small library | `/docs/threat-model`, `Erc8004Adapter` |
| Key rotation needs no old passkey | **Open decision.** Anyone controlling the wallet can rebind | `/docs/threat-model` |

Threat numbers the pack refers to but never defines (T1, T3, T8, T10, T11) are not mapped: the source spec that
defined them is not in the repository.
