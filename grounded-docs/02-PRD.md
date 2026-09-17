# Grounded — Product Requirements Document (v1, hackathon)

| | |
|---|---|
| Status | Approved for build · 17 Sep 2026 |
| Track | Monad Metropolis — Trust, Identity & AI Infrastructure |
| Network | Monad Testnet (10143) |
| Type | Protocol primitive + SDK (developer product, not consumer app) |

## 1. Problem

ERC-8004 gives AI agents an onchain identity and a Reputation Registry, but reputation there is unusable for trust decisions: feedback isn't tied to any real interaction, values have no shared scale, one input can swing an aggregate, and faking reputation costs cents. A July 2026 study measured 59–91% coordinated Sybil reviewers depending on chain.

Result: an agent, x402 client, or marketplace can't use ERC-8004 reputation to decide whether to pay an unknown agent. Each app builds its own closed reputation, which recreates platform capture.

## 2. Solution

Grounded is an open layer on top of the official ERC-8004 registries. A rating counts only if:
1. the reviewer **paid** the agent onchain (one receipt → one rating),
2. the rating is **signed with a passkey** bound to the reviewer,
3. it uses a **fixed scale and tag**,
and the score is a **public contract view** anyone can recompute.

Positioning line: **payment-grounded, not self-attested.** (Reputation-Slasher, live on testnet, relies on the agent owner attesting that an interaction happened.)

## 3. Users

| Persona | Job to be done | What they use |
|---|---|---|
| **Buyer-agent developer** (primary) | "Before my agent pays an unknown agent, check it's trustworthy" | `check()`, `withTrust(fetch)`, MCP tool (stretch) |
| **Agent seller / x402 API owner** | "Earn a reputation that other apps respect, from my real customers" | `groundedPaywall()`, register in ERC-8004 |
| **Marketplace / directory builder** | "Rank agents without building a moderation team" | `score()`, public read API, indexer GraphQL |
| **Onchain protocol** | "Only let trusted agents call my contract" | `GroundedGate.onlyTrusted` |
| **Human reviewer** | "Rate an agent I paid in one tap" | Playground / integrator UI with passkey |

Why they won't roll their own: payment receipts + passkey verification + Sybil-resistant scoring is ~4 contracts of security-sensitive work, and a private score is worth less than a shared one every app reads.

## 4. Scope

### In v1
- F1 Receipt issuance for stablecoin payments via a non-custodial `ReceiptRouter` (direct pay + EIP-3009).
- F2 Passkey-bound reviewer identities verified onchain via P256 precompile `0x0100`.
- F3 Grounding existing ERC-8004 feedback; onchain grounded score (`scoreOf`, `meets`).
- F4 TypeScript SDK: `score`, `check`, `withTrust`, `pay`, `rate`, `bindPasskey`, software authenticator.
- F5 Seller middleware `groundedPaywall()` (402 scheme `grounded-router`).
- F6 Explorer: raw vs grounded score per agent, reviewers, receipts, total paid.
- F7 Playground: login → fund → bind passkey → pay demo agent → rate → watch score.
- F8 Docs site: quickstart, SDK ref, scoring spec, contracts, threat model.
- F9 `GroundedGate.sol` helper.
- F10 Demo seller agent + demo buyer agent.
- F11 Public read API `GET /api/v1/agents/:id/score` (read-only, cached, rate-limited).

### Stretch (only if on schedule by 27 Sep)
- S1 MCP tool `grounded_check`.
- S2 Router-aware x402 facilitator fork (payment option A).

### Out of scope (roadmap)
ZK receipts (privacy, T9) · sealed/commit-reveal epochs (needs BTX) · proof of personhood · disputes/refunds/escrow · Validation Registry · any token · mainnet.

## 5. User stories and acceptance criteria

**US1 — Check before paying (buyer dev)**
- Given an agentId, `g.check(id, {minScore:70, minReviewers:5})` returns `{pass, reasons[]}` in < 1 s on testnet.
- `withTrust(fetch)` throws `UntrustedAgentError` and sends no payment when the check fails.

**US2 — Get paid and earn reputation (seller)**
- Adding `groundedPaywall({agentId, price})` to a Hono/Express route returns a 402 with payment instructions.
- A request retried with a valid receipt proof returns 200; the same receipt cannot unlock the route twice; a receipt id presented without the payer's signature is rejected.

**US3 — Rate an agent (reviewer)**
- After paying, `g.rate({receiptId, score, tag:"quality", passkey})` results in a `Grounded` event and an updated `scoreOf`.
- Rating twice with a second receipt replaces the first rating (reviewer count unchanged).
- Agent owner, operators, and agentWallet cannot produce a counted rating.

**US4 — See the difference (anyone)**
- Explorer agent page shows raw ERC-8004 summary and grounded score side by side, with reviewer count, receipts, total paid, confidence, `ownerChangedAt`.
- Seeded Sybil agent shows high raw score and low/low-confidence grounded score.

**US5 — Gate a contract (protocol dev)**
- `onlyTrusted(agentId)` reverts with `AgentNotTrusted(agentId)` when `meets()` is false.

**US6 — Judge path**
- A judge with only an email can complete the playground in ≤ 5 min on a phone or laptop.

## 6. Success metrics (hackathon)

| Metric | Target | Judging criterion |
|---|---|---|
| External team integrated (tx on testnet using SDK) | ≥ 1 | Traction 20% |
| Teams that tried the SDK | ≥ 3 | Traction |
| Quickstart time for a new dev | ≤ 10 min | Design & craft 20% |
| SDK calls to integrate trust gate | 1–2 lines | Design & craft |
| Contracts with admin/upgrade path | 0 | Technical execution 20% |
| Secrets in git history | 0 | Technical execution |
| Critical/high findings (Slither/Aderyn) | 0 open | Technical execution |
| Named adopters with reason in pitch | ≥ 3 | Founder & market 25% |

## 7. Go-to-market (hackathon window)

Target list (fill with real names by 18 Sep): Monad agent teams registering in ERC-8004 · x402 API sellers on Monad · agent marketplaces/directories · other Metropolis teams building agents (they are still building — easiest yes) · the Reputation-Slasher team (as a second signal source, not a rival).

Offer: "One-line trust gate + we write the integration PR for you." Evidence to collect: repo link, tx hashes, 1-sentence quote.

Post-event plan: upstream router-aware facilitator; propose `quality`/`dispute` tag set to the ERC-8004 community; ZK receipts v2; mainnet deploy once receipts are audited.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| ERC-8004 not on testnet | Pitch claim weaker | Deploy reference registries day 1 |
| WebAuthn verification fails | Core feature | 21 Sep kill switch → wallet-sig binding |
| No integrator | −20% criterion | Outreach from day 1; write PRs for them |
| Wash rating (T2) raised by judges | Credibility | State it upfront; show owner/operator exclusion + unique payer counts |
| Privacy (T9) | Credibility | Dedicated rating wallet in SDK; ZK receipts as named v2 |
| Judges can't get test funds | Can't use demo | Drip route + Privy email login |
| Scope creep | Miss freeze | Stretch items only after 27 Sep; freeze 28 Sep |

## 9. Deliverables checklist
- [ ] Logo/graphic (PNG/JPG/WEBP ≤ 3 MB)
- [ ] Public repo, access for `metropolis@hackathon.monad.xyz`
- [ ] Demo video ≤ 3 min, live product
- [ ] Pitch video ≤ 2 min
- [ ] Live link on Monad testnet + judge access instructions + test login
- [ ] (Optional) 30 s ad
