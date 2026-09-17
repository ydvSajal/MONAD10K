# Grounded — Start Here (support doc)

> Payment-grounded reputation for ERC-8004 agents on Monad Testnet (chain 10143).
> Spec source of truth: build spec v0.2 (17 Sep 2026). This pack turns it into an executable plan.
> Where this pack **changes** the spec, it says so under "Spec deltas" below.

## The pack

| File | Use it for |
|---|---|
| `00-START-HERE.md` | This file. Day-1 commands, decisions, spec deltas, working rules |
| `01-TIMELINE.md` | 12-day build (17–28 Sep), test week (29 Sep–5 Oct), ship week (6–13 Oct) |
| `02-PRD.md` | What we ship, for whom, acceptance criteria, success metrics |
| `03-TRD.md` | Contract specs, check order, scoring maths, SDK API, 402 protocol, test plan |
| `04-SYSTEM-ARCHITECTURE.md` | Components, trust boundaries, data flows, repo layout, data model |
| `05-DEPLOYMENT-AND-REQUIREMENTS.md` | Where everything runs, accounts, costs, env vars, tooling requirements |

Drop the folder into the repo as `docs/planning/`. Point Claude Code / any coding agent at `03-TRD.md` + `04-SYSTEM-ARCHITECTURE.md` per milestone.

## Critical path in one line

Contracts deployed (21 Sep) → SDK can pay + rate (24 Sep) → explorer shows raw vs grounded (26 Sep) → docs + freeze (28 Sep). Outreach for an integrator runs **in parallel from day 1**, not after the build.

## Day 1 — do these today (17 Sep)

```bash
# 0. Tooling
curl -L https://foundry.paradigm.xyz | bash && foundryup
npm i -g pnpm

# 1. A1 check — is ERC-8004 actually deployed on Monad testnet?
cast code 0x8004A818BFB912233c491871b3d84c89A494BD9e --rpc-url https://testnet-rpc.monad.xyz
cast code 0x8004B663056A597Dffe9eCcC1965A193B7388713 --rpc-url https://testnet-rpc.monad.xyz
#   "0x" = not deployed -> deploy the reference registries ourselves (TRD §2.6)

# 2. Deployer key: Foundry keystore, NEVER .env
cast wallet new                      # fresh throwaway key
cast wallet import grounded-deployer --interactive

# 3. Scaffold (layout in 04-SYSTEM-ARCHITECTURE.md §6)
mkdir grounded && cd grounded && git init
pnpm init && forge init contracts --no-git
forge install OpenZeppelin/openzeppelin-contracts   # pin a tag, see TRD §3
```

Also today:
1. **Lock the passkey relying-party ID (rpId).** The contract stores `sha256(rpId)` as an immutable. Changing domain later = redeploy. Pick the production web domain now (TRD §3.2).
2. Fund the deployer: Monad testnet faucet (MON) + Circle faucet (USDC, Monad Testnet).
3. Pull the real ERC-8004 ABI from the deployed/reference contract and confirm the feedback read function + value type (TRD §2.5).
4. Start the integrator target list (PRD §7). Post in the hackathon Discord today.

## Decisions made in this pack

| # | Decision | Why |
|---|---|---|
| D1 | Payment option **B** (direct pay via `ReceiptRouter`) | Hosted facilitator settles straight to token; forking it is out of v1 |
| D2 | Custom 402 scheme `grounded-router` (x402-shaped, not stock x402) | Receipts need settlement through the router. Be explicit about this in docs |
| D3 | Weighted **median**, **no trimming** | Symmetric trimming never changes a weighted median — it is dead gas (TRD §4) |
| D4 | Integer `log2` weight, cap 4 | Cheap and deterministic onchain; documented step function |
| D5 | Passkey client lib: `ox` (`WebAuthnP256`) | Returns `authenticatorData`, `clientDataJSON`, `challengeIndex`, `typeIndex` — maps 1:1 to our struct |
| D6 | Browser wallet for judges: Privy embedded wallet + injected wallets | Judges won't have a Monad-configured extension |
| D7 | Indexer: Envio HyperIndex (hosted) | First-class Monad testnet support; avoids `eth_getLogs` range limits |
| D8 | Docs inside the web app (Fumadocs) | One deploy, one domain, one rpId |
| D9 | No admin, no upgrades, no owner in any contract | Removes the whole "leaked admin key" class |
| D10 | Kill switch for passkeys moved to **21 Sep** (was 28 Sep) | 12-day build has no slack for a late fallback |

## Spec deltas (update the spec page after this)

1. Scoring: remove the 10% trim (D3). Keep median, min 5 reviewers for "ok" confidence.
2. Weight: `min(1 + floor(log2(1 + amount / 100_000)), 4)` on 6-decimal amounts (D4). Weight 4 is reached at ≥ 0.70 USDC.
3. `commit()` removed from the v1 interface (sealed mode already cut).
4. Seller-side receipt proof: access requires a payer signature over the receipt id (TRD §6) — otherwise anyone can reuse a public receipt id to get the resource.
5. Headless agents rating: SDK ships a **software P256 authenticator**. The contract cannot tell hardware from software keys; the UV flag is self-reported. Document under T7.

## Hidden problems to watch (read before coding)

- **Monad bills the gas *limit*, not gas used.** Every SDK write sets a measured limit + ~15%. Never let a wallet default to a huge limit.
- **`eth_getLogs` is range-capped** (~1000 blocks on public RPC, 10 on some free tiers). Don't build any read path that scans logs from the client.
- **`giveFeedback` records `msg.sender`.** Grounded must never post feedback on anyone's behalf.
- **Monad USDC EIP-712 domain name is `"USDC"`.** Hardcode + regression test.
- **Redeploying after an integrator starts = broken integrator.** After 28 Sep, only redeploy for a real bug, and version addresses in the SDK.
- **Passkeys need HTTPS + the exact rpId.** Vercel preview URLs will fail verification by design. Test passkeys on the production domain only.
- **T2 wash rating is not solved.** Say it in the pitch before a judge does.

## Working rules

- Branches: `feat/<area>-<thing>`, PR into `main`, CI must pass (forge test, typecheck, gitleaks).
- Every env var goes in `.env.example` with a comment. No secret ever in git.
- Each day ends with something runnable and a one-line entry in `docs/BUILDLOG.md` (also feeds content/pitch).
- If a blocker repeats twice, stop and use the checkpoint fallback in the timeline.
