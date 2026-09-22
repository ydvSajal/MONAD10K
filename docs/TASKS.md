# Grounded — Tasks

Single view of what is done, overdue, and coming. Source plan: `grounded-docs/01-TIMELINE.md`. Status of record: `CLAUDE.md` (local). Update this file whenever a box changes.

**Today:** Mon 21 Sep 2026 · **Submit:** Mon 12 Oct · **Hard deadline:** Wed 14 Oct 09:29 IST
**Position:** end of timeline Day 3 work is done, but the plan expected Day 5 (deploy + checkpoint) by today. **About 2 build days behind.** Days 4–5 work is still open.

Legend: `[x]` done · `[ ]` open · `[!]` overdue or blocked · `[~]` partly done

---

## 1. Done

- [x] Day 1 — toolchain (Foundry, Slither, Aderyn, gitleaks in WSL), monorepo scaffold, CI (forge test, fmt, gitleaks), `.env.example`
- [x] A1 checkpoint — ERC-8004 is deployed on Monad testnet; ABIs pulled and selector-verified against bytecode
- [x] Day 2 — `ReceiptRegistry`, `ReceiptRouter` (`pay`, `payWithAuthorization`), fork test against live agent 1
- [x] PR #1 merged (`6d791f9`), incl. Copilot fix: router-as-recipient fund lock (`InvalidRecipient`)
- [x] Secrets: gitleaks clean on full history; allowlist narrowed to `.env.example`
- [x] Day 3 — `GroundedWebAuthn` + `ReviewerRegistry.bind`; 30 unit tests + live-precompile fork test (`bind` 158k gas)
- [x] **21 Sep passkey kill switch: cleared** (no wallet-signature fallback needed)
- [x] PR #2 merged (`7b545b5`), incl. Copilot fixes to 2 tests
- [x] Decisions D11–D16 logged (D15 WebAuthn only, D16 rpId)

## 2. Overdue (should already be done)

### Contracts (A) — critical path
- [ ] **Storage layout for `GroundedReputation`** — settle `Live` incl. `feedbackIndex` (needed for `sweepRevoked`) **before** deploying it
- [ ] `ScoringLib`: 21-bucket histogram, integer-log2 weight (cap 4), weighted median, live-rating replace
- [ ] `adapters/Erc8004Adapter.sol`: require `valueDecimals == 0`, value in [0,100], `tag1 == "quality"`
- [ ] `GroundedReputation.ground` with full check order (TRD §2.4/§2.5), `scoreOf`, `meets`
- [ ] `sweepRevoked(agentId, reviewer)` — permissionless revocation removal; add the spec to TRD §2.5 first
- [ ] Fuzz `ScoringLib`: median vs reference sort
- [ ] End-to-end forge test: register → pay → giveFeedback → bind → ground → `scoreOf`
- [ ] Invariants: receipt consumed once; histogram mass == sum of live weights
- [ ] `forge test --gas-report`: record `ground` gas (A9) in TRD. **Checkpoint: ≤ ~250k**
- [ ] `Deploy.s.sol`; testnet deploy; verify sources; write `deployments/10143.json`

### Day 3 leftovers
- [ ] `ox` browser + software-authenticator spike that produces a `WebAuthnSig` (B). Timeline wanted a *real browser* assertion verified in a fork test; the current test uses a Foundry-signed software passkey only
- [ ] Real-device sanity: one actual browser passkey through `bind` on testnet (done properly in Test week's passkey matrix, but a single smoke test earlier de-risks it)

### GTM (D) — no record of any of it in the repo
- [ ] Integrator target list (20 names)
- [ ] First "looking for 1 agent team to integrate" post
- [ ] `docs/OUTREACH.md` (team, contact, status, next step)
- [ ] Daily 30-min outreach; build-in-public post every 2–3 days

### Config debt
- [!] **rpId** — user has the real domain, not yet given. Blocks the `ReviewerRegistry` deploy. Redeploy is needed anyway if `localhost` is used (D16 debt, due before 5 Oct)

## 3. Tonight — 21 Sep deploy (user request)

- [ ] User: import Foundry keystore (`cast wallet import grounded-deployer --interactive`)
- [ ] User: fund deployer with testnet MON (~0.5)
- [ ] User: send the **domain** (rpId) and the **deployer address**
- [ ] `Deploy.s.sol` for `ReceiptRegistry`, `ReceiptRouter`, `ReviewerRegistry` (three contracts now; `GroundedReputation` follows Day 4)
- [ ] Dry-run on a Monad fork, then broadcast; verify sources; write `deployments/10143.json`
- [ ] Update `.env.example`, `CLAUDE.md`, `docs/BUILDLOG.md`

## 4. Checkpoints

| Date | Check | Status | If it fails |
|---|---|---|---|
| 17 Sep | ERC-8004 deployed? | [x] Yes | — |
| 21 Sep | WebAuthn fork test passing? | [x] Yes | — |
| 21 Sep | `ground` gas ≤ ~250k? | [!] Not measured, `ground` not built | Cheaper feedback checks; OZ path only for `clientDataJSON`; re-measure |
| 22 Sep | Placeholder submission in; repo public; invite `metropolis@hackathon.monad.xyz` | [ ] Tomorrow | — |
| 24 Sep | 402 loop working? Also ≥2 teams said "yes, will try it" | [ ] | Demo uses `pay()` + `rate()` with no paywall |
| 25 Sep | Envio indexer up? Also pick KIMI vs Qwen (06) | [ ] | Explorer reads `scoreOf` onchain + viem poller into Neon |
| 28 Sep | Feature freeze. Integrator has SDK installed? | [ ] | Offer to write the integration PR for them |
| 5 Oct | Integrator live; no P0/P1 open | [ ] | Best "in progress" evidence + a named second team. Don't fake it |
| 6 Oct | Chainlink CRE gate (Q8) | [ ] | Remove from submission |
| 12 Oct | Submit final | [ ] | Buffer 13–14 Oct for emergencies only |

## 5. Coming — Build phase (17–28 Sep)

The dates are the plan's. Dates before today are already slipped, so treat the order as the plan and compress it.

- **22 Sep — Day 6: SDK read path + placeholder**
  - [ ] D: submit placeholder entry (name, one-liner, repo link); repo public; invite `metropolis@hackathon.monad.xyz`
  - [ ] B: `packages/sdk` — wagmi-cli ABIs, addresses, `score()`, `check()`, raw score via `getClients` + `getSummary`
  - Done when: `pnpm --filter @grounded/sdk test` reads a live score from testnet
- **23 Sep — Day 7: SDK write path**
  - [ ] `bindPasskey()`, `pay()`, `rate()` (giveFeedback → ground back-to-back, gas = measured × 1.15), software authenticator for headless agents, typed errors
  - Done when: a Node script pays an agent and produces a counted rating
- **24 Sep — Day 8: 402 flow**
  - [ ] `groundedPaywall()` Hono middleware (receipt + payer signature + used-receipt store); `withTrust(fetch)`
  - [ ] `apps/demo-seller`, `apps/demo-buyer`
  - Done when: buyer → 402 → pay → retry → 200, and the buyer refuses a low-score agent
- **25 Sep — Day 9: indexer + seed data**
  - [ ] Envio HyperIndex: `ReceiptIssued`, `ReviewerBound`, `Grounded`, `NewFeedback`, `FeedbackRevoked`; deploy to Envio Cloud
  - [ ] `scripts/seed`: 3 demo agents; Sybil unpaid spam (raw inflated), real payers (grounded honest), one rejected owner wash-rating
- **26 Sep — Day 10: explorer + playground**
  - [ ] `apps/web`: agent list, agent page (raw vs grounded, reviewers, receipts, paid total, `ownerChangedAt`), reviewer page
  - [ ] Playground: Privy login → drip test funds → bind passkey → pay → rate → score moves. Must work from a phone on the production domain
- **27 Sep — Day 11: docs + extras**
  - [ ] Fumadocs: Quickstart (≤10 min), SDK ref, scoring spec, contracts ref, 402 scheme, threat model, FAQ
  - [ ] `GroundedGate.sol` (`onlyTrusted`) + example
  - [ ] Stretch, cut first: MCP tool `grounded_check` (allowed only after 27 Sep per rule 10)
- **28 Sep — Day 12: freeze**
  - [ ] Fresh-clone e2e on testnet; fix blockers only; README polish
  - [ ] Tag `v0.1.0`, `npm publish --tag beta`; production deploys (web, seller, indexer)
  - [ ] **Feature freeze at end of day.** Unfinished work goes to the roadmap list

## 6. Coming — Test week (29 Sep – 5 Oct)

- [ ] 29 Sep — coverage ≥90% on core; Slither + Aderyn, no high/medium open; extra fuzz/invariants
- [ ] 30 Sep — gitleaks full history; rotate old AgenPay + Neon keys; env audit; rate limits on API + drip
- [ ] 1 Oct — passkey matrix: Chrome/Win Hello, Safari/macOS, iOS Safari, Android Chrome, synced (counter = 0), 1Password
- [ ] 2 Oct — integrator day: pair with an external team, fix their friction live
- [ ] 3 Oct — adversarial tests, threats T1–T12 (wash rating, replay, malleability, dust, expired receipt, revoked feedback, identity transfer)
- [ ] 4 Oct — 2 outsiders do Quickstart cold, ≤10 min; re-measure SDK gas limits
- [ ] 5 Oct — bug bash; patch `v0.1.x`; **integrator live**; **redeploy with the real rpId if not already done**
- Redeploy rule: contracts only redeploy for a correctness bug; bump SDK minor version and tell the integrator the same day

## 7. Coming — Ship week (6–12 Oct)

- [ ] 6 Oct — demo video script (≤3 min, live product); pitch script (≤2 min); name the Reputation-Slasher distinction in the first 20 s
- [ ] 7 Oct — record demo on production URLs; logo (PNG ≤3 MB)
- [ ] 8 Oct — record pitch video; optional 30 s ad
- [ ] 9 Oct — judge access doc: URLs, Privy test login, drip steps, contract addresses, 5-minute judge path
- [ ] 10 Oct — integration evidence (repo link or tx hashes + quote); post-event plan in README
- [ ] 11 Oct — final secrets audit; proofread; check every link in incognito
- [ ] 12 Oct — **submit final**; verify repo access for `metropolis@hackathon.monad.xyz`
- [ ] 13–14 Oct — buffer, emergencies only

## 8. Open questions (need user)

| # | Question | Needed by | Default if unanswered |
|---|---|---|---|
| 1 | Production domain for rpId (`ReviewerRegistry`); full host, e.g. `x.vercel.app` needs the exact subdomain | Tonight | none, blocks deploy |
| 3 | Team: solo, or owners per workstream A–D? | Soon | Assume solo |
| 4 | Skills to install | — | None |
| 6 | Privy: no facilitator exists. Custody drip + demo wallets, or drop beyond judge login? | 25 Sep | Drop |
| 7 | Scope: 06 adds ~4 integrations to a plan with no slack. What gets cut? | 25 Sep | Cut KIMI/Qwen + Alchemy, keep Envio |
| 8 | Chainlink CRE as the `sweepRevoked` scheduler, or remove? | 6 Oct | Remove unless time remains |
| 9 | Deploy inputs: keystore + testnet MON + deployer address | Tonight | none, blocks deploy |

## 9. Risks to watch

- **Behind schedule.** ~2 build days late, and the scoring core (the product's heart) doesn't exist yet. Days 6–9 (SDK, 402, indexer) all depend on the `GroundedReputation` ABI, so Day 4 is the next bottleneck. If Day 4 slips past 23 Sep, invoke the timeline's fallbacks rather than drift (rule 9).
- **rpId** decides whether the hosted playground can use passkeys at all. Wrong value means a redeploy and lost bindings.
- **Tomorrow is the placeholder submission.** Repo is already public per CLAUDE.md, but the entry itself is not submitted.
- **No GTM record.** The 24 Sep "2 teams said yes" and 28 Sep "one has the SDK" gates need outreach to have started.
- **`CLAUDE.md` is gitignored.** It has no backup. It was accidentally truncated once today and restored from context. Consider copying it to a private gist or dropping the ignore.
- **ERC-8004 registries are upgradeable and owned by their deployer.** A trust assumption, not ours. Put it in the threat model.
