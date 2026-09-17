# 06 — INTEGRATIONS

**Status:** spec, not yet built · **Owner:** Sajal · **Deadline:** 14 Oct 2026, 09:29 IST

Instructions for Claude Code. Imperative voice. Do not improvise beyond what is written here.

---

## 0. Read before you touch anything

Read in this order, then reconcile this doc against them:

1. `grounded-docs/00-START-HERE.md`
2. `grounded-docs/03-TRD.md`
3. `grounded-docs/04-SYSTEM-ARCHITECTURE.md`
4. `grounded-docs/05-DEPLOYMENT-AND-REQUIREMENTS.md`
5. `CLAUDE.md`

**Those docs are the source of truth for folder structure, module names, and data model.** This doc is the source of truth for *which* third-party services go where and why. Where the two conflict on a path or a name, follow the repo. Where they conflict on whether an integration belongs at all, follow this doc.

If a path referenced below does not exist in the repo, **stop and report it** — do not create a parallel structure.

---

## 1. Goal

Wire six sponsor integrations into Grounded such that every one of them is load-bearing infrastructure the primitive needs, not a prize-farming bolt-on.

## 2. The rule that governs every decision in this doc

> **An integration ships only if Grounded would need it with the prize money removed.**

Grounded is judged on Technical Execution (20%) and Design & Craft / developer experience (20%). A shallow integration is worse than an absent one: it adds an SDK the repo has to justify and it reads as farming to a judge who opens the source. If during implementation an integration cannot be made load-bearing, **remove it and report, do not stub it**.

## 3. Scope

| Integration | Role in Grounded | Prize | Status |
|---|---|---|---|
| Privy | Server-side key custody + policy for the facilitator & agent wallets | $5,000 | Committed |
| Mera (PRF) | Passkey-derived, namespaced signing keys for attestations | $2,500 | Committed |
| Alchemy | Monad RPC + event webhooks driving the explorer & recompute | $1,000 credits | Committed |
| Envio HyperIndex | Queryable index of attestations / revocations | $1,000 | Committed |
| KIMI **or** Qwen (pick one) | Model powering the agent's trust check | ~$300 / $5,000 credits | Decide by 25 Sep |
| Chainlink CRE | Scheduled score recompute + revocation sweeps | $3,000 | **Conditional — see §9** |

**Non-goals. Do not add these even if they look convenient:**

- **Dynamic SDK** — competes directly with Privy. Two auth/wallet SDKs doubles key-management surface for zero architectural gain.
- **Mera-Powered UX bounty** — its brief forbids a custody backend, which Privy is. Also judged on consumer time-to-first-transaction; Grounded is a developer primitive.
- **Nansen** — making reputation resolution depend on a proprietary API contradicts the Originality claim ("not capturable by a single platform").
- **Aurora Intents** — a bridge bolted onto a registry. Off-thesis.
- **Agora / Kuru / Perpl / MetaMask Agent Wallet / Hunyuan** — track-locked to Onchain Finance or Social. Ineligible under Trust, Identity & AI Infrastructure.

---

## 4. Privy — custody and policy

**Why:** Grounded has an outstanding security debt: the x402 facilitator holds a hot `PRIVATE_KEY`. Technical Execution explicitly names leaked secrets. Privy server wallets remove the raw key from the process. This integration *is* the fix for that debt — treat it as security work that happens to pay $5,000.

**Bounty requirement:** must go beyond authentication. Login-only does not qualify. Bonus points for multiple Privy features meaningfully integrated. So ship **two**:

1. **Server wallets** — facilitator signing key and the agent's operational wallet. No `PRIVATE_KEY` in env, no key in process memory.
2. **Policy engine / transaction controls** — constrain what the facilitator wallet can do: allowlist target contracts (registry, attestation contract), cap value per transaction, deny everything else. Wire the deny path to a logged, typed error — do not swallow it.

**Build notes:**

- Read current Privy server-wallet + policy docs before writing code. Do not guess the SDK surface from memory; it changes.
- Privy calls live behind an interface in the custody module (see `03-TRD.md` for the module name). Business logic must not import the Privy SDK directly.
- Delete every remaining reference to a raw facilitator private key, including comments, `.env.example`, and git history if it was ever committed. If it was committed, say so in the report — rotation is a separate task.

**Verification:**

- [ ] `grep -ri "PRIVATE_KEY" --exclude-dir=node_modules .` returns nothing outside documentation describing its removal
- [ ] A transaction to a non-allowlisted address is rejected by policy, with a test proving it
- [ ] Demo script shows a settlement signed via Privy server wallet, on Monad testnet
- [ ] README names both Privy features and what each protects

---

## 5. Mera PRF — key derivation and the signer answer

**Why this matters more than the money:** Grounded's open design question is who signs an attestation and how that key is held. Technical Execution names "sound key derivation" directly. Mera's PRF output is deterministic key material where each salt is an isolated namespace — one passkey mints unlimited unrelated keys, reconstructible from the passkey alone, nothing persisted.

That is the architecture Grounded needs anyway. The bounty also permits a wallet as long as the wallet is not the point, so it does **not** conflict with Privy custody.

**Design — namespace layout.** Derive one key per purpose, never reuse a salt across purposes:

| Namespace (salt) | Purpose |
|---|---|
| `grounded:reviewer:v1` | Reviewer identity — binds a review to a passkey-held identity |
| `grounded:attest:<issuer-id>:v1` | Per-issuer attestation signing |
| `grounded:disclose:<predicate-id>:v1` | Per-predicate selective-disclosure key |

Finalise this table against `03-TRD.md`'s attestation schema **before** writing the schema, not after — namespace design constrains what a disclosure predicate can prove.

**Build notes:**

- Start from `mera.category.xyz/concepts/passkeys-and-prf/`, then `/reference/`, then `github.com/category-labs/mera`. Do not invent API signatures.
- Nothing derived may be persisted to disk, localStorage, or the server. Derive on demand from the passkey.
- Salt strings are constants in one module with a comment explaining the namespace contract. No inline string literals at call sites.

**Verification (this is also the strongest 20 seconds of the demo video):**

- [ ] **Cross-device test:** same passkey in a fresh browser profile reproduces identical derived keys and decrypts the same state, live
- [ ] No derived key material in any storage — verified by clearing storage mid-flow and reconstructing
- [ ] Each namespace produces a distinct, stable key; test asserts non-equality across salts
- [ ] Demo script includes the cross-device reproduction as an explicit on-camera step

---

## 6. Alchemy — RPC and event pipeline

**Why:** You need Monad testnet RPC regardless. The explorer needs to know when an attestation is issued or revoked without polling.

**Build:**

1. Alchemy as the Monad RPC provider, endpoint in env.
2. **Webhooks / subscriptions** on `AttestationIssued` and `AttestationRevoked` (confirm exact event names against the contracts). Webhook hits a route handler that enqueues a score recompute for the affected subject.
3. Route handler must verify the webhook signature. An unauthenticated recompute trigger is an availability bug and a judge-visible one.

**Boundary with Envio — state this in the README explicitly so both integrations read as intentional:**

- Alchemy = node access + push notification of new events
- Envio = queryable historical index the explorer and SDK read from

**Verification:**

- [ ] Attestation issued on testnet triggers the webhook and a recompute, end to end
- [ ] Unsigned / wrong-signature webhook payload is rejected, with a test
- [ ] `.env.example` lists the RPC URL and webhook signing key with comments

---

## 7. Envio HyperIndex — the queryable index

**Why:** The registry explorer and the SDK's "show me this subject's attestations" call both need historical queries across attestations, revocations, and scores. Bounty asks for real on-chain data driving the product, which is exactly this.

**Build:**

- Index `AttestationIssued`, `AttestationRevoked`, and whatever score/ground events the contracts emit.
- Handlers resolve current state per subject: active attestation count, revoked count, derived score inputs. Revocation must be reflected — an index that shows revoked attestations as live is a correctness bug in a trust primitive.
- The explorer and the public SDK read through the Envio GraphQL endpoint, not by scanning logs at request time.

**Verification:**

- [ ] Indexer runs against Monad testnet and reaches head
- [ ] Revoking an attestation flips its state in a query within one block cycle
- [ ] SDK read path hits the index, not the RPC, for historical queries
- [ ] Indexer config committed and documented in `05-DEPLOYMENT-AND-REQUIREMENTS.md`

---

## 8. KIMI or Qwen — one model, not both

**Decide by 25 Sep. Pick exactly one.** "Genuinely powered by" cannot be true of two models at once, and claiming both discounts both.

- **KIMI (Moonshot):** $3,000 split across 10 teams ≈ $300 in credits. All tracks.
- **Qwen 3.8 Max (Alibaba Cloud):** $5,000 in credits, tagged Trust/Identity, asks for "genuinely agentic."

Either way, the requirement is the same: the model drives a core feature, not a chatbot widget. In Grounded that core feature is the **agent's trust check** — the LangGraph agent consuming a reputation proof and deciding whether to proceed with a counterparty.

**Build notes:**

- Route through the provider-agnostic layer (Vercel AI SDK / Mastra per stack defaults). Model name is config, not code. The SDK must not appear in business logic.
- Both bounties require **a published article/blog post** explaining how the model was used and what value it brought. Write it as the Traction & Path Forward artifact you need anyway — the technical post on why work reputation must be payment-grounded rather than self-attested, with the model's role documented inside it. One artifact, two purposes.

**Verification:**

- [ ] Swapping the model is a single config change, proven by running the trust check on a second provider
- [ ] Blog post published, linked from README
- [ ] Only one model is claimed as "powering" the project, in README, videos, and submission text

---

## 9. Chainlink CRE — conditional, decide by 6 Oct

**This is the only integration that does not clearly pass §2.** It is currently marked ADDED on the submission form.

It passes **only if** a CRE workflow genuinely replaces the cron in the current stack:

- Scheduled reputation score recomputation
- Periodic revocation sweeps

If, by **6 Oct**, that workflow is not real and running, **remove the bounty from the submission and delete the integration**. A decorative Chainlink dependency in a project judged on correctness costs more than $3,000 of upside.

**Verification (all or nothing):**

- [ ] CRE workflow deployed and executing on schedule
- [ ] The cron it replaces is deleted, not left running in parallel
- [ ] A recompute triggered by CRE is visible in the explorer

---

## 10. Env vars

Add to `.env.example` with a comment on each. Never commit real values. Reconcile against `05-DEPLOYMENT-AND-REQUIREMENTS.md`.

```
# --- Monad / RPC ---
MONAD_TESTNET_RPC_URL=          # Alchemy Monad testnet endpoint
ALCHEMY_WEBHOOK_SIGNING_KEY=    # verifies inbound event webhooks

# --- Privy (custody; replaces the removed facilitator PRIVATE_KEY) ---
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_WALLET_POLICY_ID=         # allowlist policy for facilitator wallet

# --- Envio ---
ENVIO_GRAPHQL_URL=              # index read endpoint for explorer + SDK

# --- Model provider (exactly one; see §8) ---
AI_PROVIDER=                    # kimi | qwen
AI_MODEL=                       # model id, config not code
AI_API_KEY=

# --- Chainlink CRE (only if §9 resolves to keep) ---
CRE_WORKFLOW_ID=
```

**Mera derives keys from the passkey at runtime — it must contribute no secret env var. If you find yourself adding one, the derivation is wrong.**

---

## 11. Build order

Sequenced against the existing timeline in `01-TIMELINE.md`. Reconcile dates against that file; it wins on scheduling.

| Order | Work | Gate |
|---|---|---|
| 1 | Mera namespace table finalised, then attestation schema | Blocks schema. Do first. |
| 2 | Privy custody + policy; purge `PRIVATE_KEY` | Security debt closed before any judge reads the repo |
| 3 | Contracts on testnet emitting the indexed events | Blocks 4 and 5 |
| 4 | Envio indexer to head | Explorer can't ship without it |
| 5 | Alchemy webhooks → recompute | Needs 3 |
| 6 | Model provider behind the abstraction; trust check live | Decide provider by 25 Sep |
| 7 | CRE workflow **or** removal decision | Hard gate 6 Oct |
| 8 | Cross-device PRF demo scripted; docs site; blog post | Feeds both videos |
| 9 | Secret rotation, final submission | Leave buffer before 14 Oct 09:29 IST |

---

## 12. Global verification before "done"

- [ ] TypeScript strict, no unexplained `any`
- [ ] No secret in client code, committed files, or git history
- [ ] Every env var above in `.env.example` with a comment
- [ ] Every third-party SDK behind an interface; none imported into business logic
- [ ] Each integration's role stated in one README line, with the Alchemy/Envio boundary explicit
- [ ] Every committed bounty demonstrably load-bearing per §2 — if not, removed and reported
- [ ] No unrelated files changed

## 13. Report back

State: what was built, what was verified (with evidence, not assertion), which integrations were removed and why, and what is deliberately deferred. If a blocker repeats twice, stop and hand back the exact missing input rather than looping.
