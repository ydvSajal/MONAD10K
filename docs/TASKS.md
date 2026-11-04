# Grounded — Tasks

Single view of what is done and what is not. Source plan: `grounded-docs/01-TIMELINE.md`. Update this file whenever a box changes.

**Updated:** Sun 4 Oct 2026 · **Integrator live:** Mon 5 Oct · **Submit:** Mon 12 Oct · **Hard deadline:** Wed 14 Oct 09:29 IST

Legend: `[x]` done · `[ ]` open · `[~]` partly done · `[-]` cut on purpose

---

## 1. Done

### Contracts (Monad testnet, live)
- [x] `ReceiptRegistry`, `ReceiptRouter` (`pay`, `payWithAuthorization` via `ReceiveWithAuthorization` to the router, agent-bound nonce)
- [x] `ReviewerRegistry` + `GroundedWebAuthn` (P256 precompile `0x0100`); passkey kill switch cleared 21 Sep
- [x] `GroundedReputation` + `ScoringLib` (21-bucket weighted median, log2 weight cap 4) + `Erc8004Adapter` + permissionless `sweepRevoked` + `lastOwnerOf`
- [x] `GroundedGate` (`onlyTrusted`) + `examples/TrustedHiring.sol`
- [x] Tests: 74 unit/fuzz/invariant + 6 fork tests against live Monad (P256 precompile, USDC EIP-3009, ERC-8004)
- [x] Stress check 4 Oct: fuzz 10k runs, invariants 2048 runs x 128 depth (~262k calls per suite), 0 failures
- [x] Static analysis: Slither + Aderyn, only known false positives (`docs/static-analysis.md`)
- [x] Gas from real transactions (`docs/gas.md`)
- [x] **Testnet deploy, redeployed 4 Nov, block 76889685, rpId `grounded.sajal.sbs`** — addresses in `deployments/10143.json`; wiring and `RP_ID_HASH` verified on chain

| Contract | Address |
|---|---|
| ReviewerRegistry | `0x41B65e7E027FB47cF4DE964F4F82A76Bc6BC5429` |
| ReceiptRegistry | `0x2E3FD91A619b39210DC1E1Ee94bDa53bD6b1Cf2c` |
| ReceiptRouter | `0xbE9dbCc36240b358233B2019253178B02D44db54` |
| GroundedReputation | `0xCA50d5222566F313D9fb890F2bce144381445356` |

### SDK and apps
- [x] `@sajalydv/grounded-sdk` read path: `score`, `check`, `assertTrusted`, `payoutWallet`, `rawScore`; live testnet addresses are the defaults
- [x] SDK write path: `pay`, `bindPasskey`, `rate`, `groundFeedback`, `SoftwareAuthenticator`, `BrowserPasskey`
- [x] 402 flow: `withTrust(fetch)` + `@sajalydv/grounded-sdk/server` `groundedPaywall` + memory and Postgres `ReceiptStore`
- [x] `apps/demo-seller` (Hono) and `apps/demo-buyer` (CLI + model-driven `agent` mode)
- [x] `scripts/seed` (fork) + `census` of the live ERC-8004 registry
- [x] `apps/web`: explorer, agent/reviewer pages, `GET /api/v1/agents/:id/score`, playground, docs at `/docs`
- [x] `@sajalydv/grounded-mcp` read-only MCP server (`grounded_score`, `grounded_check`)
- [x] One real model run (26 Sep, OpenRouter free model, fork): bought from the honest agent, refused the sybil one
- [x] CI: forge test + fmt, typecheck/test/build, gitleaks; secrets audit 4 Oct: full history clean

## 2. Not done

### Needs the owner (cannot be done from code)
- [ ] **DNS:** `A grounded 76.76.21.21` at the `sajal.sbs` registrar. Passkeys only work on `grounded.sajal.sbs`
- [ ] **Repo public**, or shared with `metropolis@hackathon.monad.xyz`
- [ ] **`npm publish`** `@sajalydv/grounded-sdk` (needs `npm login`; scope ownership unchecked)
- [ ] **Outreach:** at least one external integrator live by 5 Oct (`docs/OUTREACH.md` has the target list)
- [ ] Real-device passkey test (Touch ID / phone) on the production domain
- [ ] Demo video (≤3 min) and pitch video (≤2 min), 6–8 Oct
- [ ] Final submission by 12 Oct

### Can be done in code next
- [ ] Vercel env `GROUNDED_ADDRESSES` so the hosted explorer reads the live contracts
- [x] Seed real ratings on testnet (4 Nov, new deployment): agents 2575 honest 90/90, 2576 sybil grounded 20 vs raw 87, 2577 wash rejected then 60 (10 Oct agents 2118-2121 were on the retired deployment)
- [ ] Fresh-clone e2e against testnet (so far only against a fork)
- [x] Verify contract sources on the Monad explorer (all 4 on testnet.monadscan.com, 11 Oct)
- [ ] Tag `v0.1.0` after npm publish
- [x] Judge access doc: `docs/JUDGES.md` (10 Oct)

### Cut or not built (on purpose)
- [-] Envio indexer (explorer reads `getLogs`; can swap later)
- [-] Privy (browser test wallet + faucet instead)
- [-] Mera PRF (WebAuthn only, D15)
- [-] Chainlink CRE (anyone can call `sweepRevoked`)
- [-] KIMI / Qwen specifically (model layer is provider-agnostic; neither was run, so neither is claimed)

## 3. Open decisions

| # | Question | Default if unanswered |
|---|---|---|
| b | Keep the `.sbs` rpId despite phishing-TLD filtering risk? | Keep |
| 8 | Chainlink CRE in the submission? | Remove |

## 4. Risks

- **No external integrator yet** and 5 Oct is tomorrow. Best "in progress" evidence plus a named team; don't fake it.
- **DNS not pointed**: the hosted playground cannot use passkeys until it is.
- **`ground` gas is ~353k** (110k of it is ERC-8004 proxy reads). Fine on testnet; deferred by decision.
- **ERC-8004 registries are upgradeable and owned by their deployer.** A trust assumption we do not control; in the threat model.
- Contracts are **unaudited and testnet-only**.
