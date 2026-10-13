# Grounded

Payment-grounded reputation for [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agents on Monad Testnet (10143).

A rating counts only if the reviewer **paid the agent on chain** (one receipt, one rating), **signed it with a passkey** bound to their address, and used a fixed scale and tag. The score is a public contract view anyone can recompute — **payment-grounded, not self-attested**.

> Status: in development for Monad Metropolis. Contracts are unaudited and testnet-only.

## Why it exists

Agent reputation today is self-attested: anyone can write feedback about anyone, so the cheapest attack is also the most effective one — spin up wallets, spray five-star reviews, sell a worthless agent. ERC-8004 gives agents a shared place to *store* feedback, but it does not say which feedback deserves belief.

Grounded adds the missing precondition. A rating is counted only when the chain can prove the rater was a customer. Everything below follows from that one rule.

## Architecture

```mermaid
flowchart TB
    subgraph Client["Reviewer side"]
        BROWSER["Browser passkey<br/>(WebAuthn / ox)"]
        AGENTSW["Headless agent<br/>(software authenticator)"]
    end

    subgraph Ours["Grounded contracts — no owner, no admin, no upgrade"]
        RTR["ReceiptRouter<br/>pay · payWithAuthorization"]
        RCP["ReceiptRegistry<br/>one receipt = one rating"]
        REV["ReviewerRegistry<br/>address ↔ P256 passkey"]
        GRD["GroundedReputation<br/>ground · scoreOf · meets · sweepRevoked"]
        SCORE["ScoringLib<br/>histogram · weight · median"]
        ADPT["Erc8004Adapter<br/>the only file that knows<br/>the feedback encoding"]
    end

    subgraph External["Monad Testnet 10143 — not ours"]
        ID8["ERC-8004 Identity"]
        RP8["ERC-8004 Reputation"]
        USDC["USDC (EIP-3009)"]
        P256["P256 precompile 0x0100"]
    end

    subgraph Offchain["Off chain — all of this is deletable"]
        SDK["@sajalydv/grounded-sdk"]
        PAYWALL["402 paywall middleware"]
        WEB["Explorer · playground · docs"]
        IDX["Envio indexer"]
    end

    BROWSER --> REV
    AGENTSW --> REV
    REV --> P256
    GRD --> P256

    RTR -->|transfer| USDC
    RTR -->|getAgentWallet| ID8
    RTR -->|issue| RCP
    GRD -->|consume| RCP
    GRD -->|keyOf| REV
    GRD -->|owner · approved · wallet| ID8
    GRD --> ADPT --> RP8
    GRD --> SCORE

    SDK -.->|read| GRD
    PAYWALL -.-> RTR
    WEB -.-> SDK
    IDX -.->|events| GRD
```

The boundary matters: **delete every box in "Off chain" and the score is unchanged.** Nothing off chain sits between a payment and a rating. The SDK and explorer are convenience, not authority.

We also do not trust the ERC-8004 registries blindly — they are upgradeable and owned by their deployer, so every read of them is isolated behind `Erc8004Adapter`, and a rating's value is re-checked on chain rather than taken on faith.

## How a rating is made

```mermaid
sequenceDiagram
    autonumber
    actor R as Reviewer
    participant RTR as ReceiptRouter
    participant RP8 as ERC-8004 Reputation
    participant REV as ReviewerRegistry
    participant GRD as GroundedReputation

    Note over R,REV: once per reviewer
    R->>REV: bind(qx, qy, passkey proof)
    REV->>REV: verify via P256 precompile, bind key

    Note over R,GRD: once per rating
    R->>RTR: pay(agentId, USDC, amount)
    RTR->>RTR: pay agent wallet directly, issue receipt
    R->>RP8: giveFeedback(agentId, 80, "quality")
    Note right of RP8: the reviewer writes this themselves —<br/>Grounded never writes feedback for anyone

    R->>GRD: ground(receiptId, feedbackIndex, deadline, passkey signature)
    GRD->>GRD: deadline → receipt → payer → exclusions
    GRD->>RP8: readFeedback, must be quality, 0..100, not revoked
    GRD->>REV: keyOf(reviewer)
    GRD->>GRD: verify passkey over the exact score
    GRD->>GRD: consume receipt, weight by amount, update histogram
```

Every check has its own error and its own test. The order is cheapest-first, so a doomed call fails before it spends money on registry reads.

**If the reviewer later revokes their ERC-8004 feedback**, the rating must stop counting. Anyone may call `sweepRevoked(agentId, reviewer)`, which re-reads the registry and removes the rating if, and only if, it really was revoked. No admin, no trust, no schedule required.

## What makes a score hard to game

| Attack | What stops it |
|---|---|
| Sybil five-star spam | Each rating needs a real payment to the agent's own wallet |
| Buying a score cheaply | Weight is `log2` of the amount paid, capped at 4 — 1000× the money is 4× the vote |
| One reviewer, many ratings | One live rating per reviewer per agent; a new one replaces the old |
| Agent rating itself | Owner, approved operator, operator-for-all and agent wallet are all excluded |
| Outliers dragging the score | The score is a weighted **median**, not a mean |
| Rate, then revoke the evidence | `sweepRevoked` removes it permissionlessly |
| Reusing one payment | The receipt is consumed on the first rating, and expires after 30 days |
| Score inherited after a sale | `ownerChangedAt` is recorded, so consumers can discount ratings from before the sale |

Honest limits:

- A passkey is **not** proof of personhood. The contract cannot tell a hardware key from a software one, and it is not meant to. Sybil resistance comes from the payments, not the keys.
- **An agent's owner can still rate itself through wallets it controls.** The exclusions only catch addresses linked to the agent on chain. And because the payment lands in the agent's *own* wallet, the owner gets the money back — the real cost of self-rating is gas, not the amount paid. Payment-grounding stops strangers from spraying reviews at an agent; it does not stop an agent from reviewing itself through fresh wallets. The explorer is meant to surface reviewer patterns so this stays visible rather than hidden.

## Repo

| Path | What |
|---|---|
| `contracts/src/` | `ReceiptRegistry`, `ReceiptRouter`, `ReviewerRegistry`, `GroundedReputation`, `lib/ScoringLib`, `lib/GroundedWebAuthn`, `adapters/Erc8004Adapter` |
| `contracts/test/` | `unit/`, `fork/` (live testnet, opt-in), `invariant/` |
| `contracts/abi/erc8004/` | ABIs of the deployed ERC-8004 registries, selector-verified against testnet bytecode |
| `packages/sdk/` | `@sajalydv/grounded-sdk`: score/check, pay/rate, `withTrust`, and `groundedPaywall` (`/server`) |
| `apps/demo-seller/` | Hono agent service charging per request through the 402 paywall |
| `apps/demo-buyer/` | Script agent that pays a 402 seller only if its agent passes a trust policy; `agent` mode lets a language model choose among sellers inside limits it cannot change |
| `packages/mcp/` | `@sajalydv/grounded-mcp`: read-only MCP server (`grounded_score`, `grounded_check`) so any AI agent can ask before it pays |
| `grounded-docs/` | PRD, TRD, system architecture, timeline, deployment, integrations |
| `docs/BUILDLOG.md`, `docs/TASKS.md` | Daily log, and what is left |

## Develop

```bash
cd contracts
forge build
forge test                                    # unit + fuzz + invariant
MONAD_FORK_RPC=https://testnet-rpc.monad.xyz \
  forge test -n monad --match-path "test/fork/*"   # live testnet; -n monad is required
```

`-n monad` selects Foundry's Monad network family — forks fail without it.

### Run the stack locally

There is no offchain facilitator: `ReceiptRouter` settles every payment onchain. Locally that means an anvil fork of Monad testnet with our four contracts on it, and a seller behind the 402 paywall.

```bash
# 1. chain: fork testnet (live ERC-8004 + USDC underneath), deploy Grounded to it
anvil --fork-url https://testnet-rpc.monad.xyz --host 0.0.0.0
cd contracts && RP_ID=localhost forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key <anvil key 0> --broadcast --skip-simulation     # writes deployments/10143.json

# 2. backend: demo seller, paid as agent 1 (has a payout wallet)
pnpm --filter @sajalydv/grounded-sdk build
SELLER_AGENT_ID=1 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 pnpm --filter @grounded/demo-seller start   # :8787

# 3. buyer: pays only if agent 1 passes the policy (default: score >= 70 from >= 1 reviewer)
BUYER_PRIVATE_KEY=<funded key> NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 pnpm --filter @grounded/demo-buyer start -- \
  --target http://localhost:8787/insight --min-score 0 --min-reviewers 0
```

`GET /insight` answers 402 until a buyer pays through the router; the buyer's `withTrust(fetch, policy)` does that automatically. An agent that fails the policy is paid nothing and the buyer exits 2 with the reasons.

## Verified on chain, not assumed

Every load-bearing claim below was checked against Monad testnet rather than taken from documentation.

| Fact | How it was checked |
|---|---|
| P256 precompile `0x0100` (EIP-7951) verifies real signatures | Called with a genuine signature; a software passkey binds through it in a fork test |
| ERC-8004 Identity `0x8004…BD9e` and Reputation `0x8004…8713` are live (UUPS proxies) | Selector check against deployed bytecode, plus live calls |
| USDC `0x534b…43A3` supports EIP-3009, 6 decimals, EIP-712 domain `"USDC"` v2 | Read from the token; a fork test pays an agent with a signed authorization |
| ERC-8004 feedback indices are **1-based** | Written and read back through the live registry (23 Sep) |
| `MCOPY`/`TSTORE` execute on 10143 | Probed with `cast call --override-code`, which is why `evm_version = "cancun"` |

Measured gas (real transactions on a fork, live precompile and registries; see `docs/gas.md`): `pay` 302k · `bind` 148k · `ground` 343k · `sweepRevoked` 108k. About a third of `ground` is exclusion and feedback reads into the ERC-8004 proxies.

## Receipt lifecycle

```mermaid
stateDiagram-v2
    [*] --> Issued: pay() transfers to the agent wallet
    Issued --> Consumed: ground() — the one rating it buys
    Issued --> Expired: 30 days pass, no transaction needed
    Consumed --> [*]
    Expired --> [*]
```

Expiry is evaluated on read, so nobody has to run a job to age receipts out, and no one can be paid to do it.

## Why Monad

Grounded runs on Monad Testnet (10143) because three things it needs exist there:

- **P256 precompile `0x0100`**: a rating is signed with a passkey and verified onchain for about 150k gas. On a chain without the precompile this needs a ~300k+ Solidity verifier or an offchain trusted signer.
- **Cheap, fast blocks**: one rating is three transactions (pay, `giveFeedback`, `ground`). That only works as a habit if each is cents and a second.
- **Live ERC-8004 registries and USDC (EIP-3009)** on the same chain, so the receipt, the feedback and the score all stay onchain.

Deployed 4 Oct 2026 (block 68082112), all four sources verified on [testnet.monadscan.com](https://testnet.monadscan.com):

| Contract | Address |
|---|---|
| ReviewerRegistry | `0xFb38DcB72C222d3943579b4F2c4C91ebcBE4eBa6` |
| ReceiptRegistry | `0xa89b76Ea9AcEA12A66Fb23d318219b9119362301` |
| ReceiptRouter | `0xab442c3cbc2997a6218FEA0DD253c3717edfc62e` |
| GroundedReputation | `0xaDDd1f2F876CD253C57177b675905Bdb0061bF82` |

Live demo: https://grounded.sajal.sbs. Judge walkthrough: [`docs/JUDGES.md`](docs/JUDGES.md).

## Attribution and AI disclosure

**AI coding tools:** this project was built with [Claude Code](https://claude.com/claude-code) (Anthropic) as a coding assistant, under the author's direction and review. Commits it helped write carry a `Co-Authored-By` trailer. Tests, fork runs and on-chain checks were run and read by the author.

**Build window:** no pre-existing code. The first commit is 17 Sep 2026 and everything in this repo was written during the hackathon.

**Third-party code and data, used unmodified unless noted:**

- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) v5.7.0 (MIT): `WebAuthn`, `P256`, ERC-20 and EIP-712 helpers. Git submodule.
- [forge-std](https://github.com/foundry-rs/forge-std) v1.16.2 (MIT/Apache-2.0): tests only. Git submodule.
- [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts): ABIs copied to `contracts/abi/erc8004/` to call the deployed registries. We do not modify or redeploy ERC-8004.
- TypeScript: [viem](https://viem.sh), [ox](https://github.com/wevm/ox), [zod](https://zod.dev), [Hono](https://hono.dev), [Next.js](https://nextjs.org), [GSAP](https://gsap.com), [AI SDK](https://ai-sdk.dev), [marked](https://marked.js.org). See `pnpm-lock.yaml` for the full tree.
- Circle USDC on Monad testnet: called, not copied.

## License

[MIT](LICENSE)

## Keys we hold and why

Nothing in the protocol has an owner, admin, pauser or upgrade path. Config is `immutable`, set once at construction. There is no setter to compromise and no key that can rewrite a score.

Off chain we hold exactly one key: a **testnet drip wallet** that hands out MON/USDC to demo users. It has no rights in any contract.

## Integrations: what is used and what is not

Rule: a third-party piece ships only if Grounded needs it with no prize attached. Otherwise it is left out, not stubbed.

- **Privy**: not used. The playground uses a browser test wallet plus a capped faucet.
- **Mera PRF**: not used. Reviewer auth is a WebAuthn assertion verified onchain.
- **Alchemy**: RPC fallback only (`RPC_URL_FALLBACK`). No webhooks: the score is computed onchain on read, so there is nothing to recompute offchain.
- **Envio**: not built. The explorer reads logs directly (`apps/web/lib/events.ts`) and can swap to an indexer later.
- **KIMI / Qwen**: a provider-agnostic model layer (`apps/demo-buyer/src/agent.ts`, three env vars). Run once for real (26 Sep, anvil fork) with OpenRouter's free `nvidia/nemotron-3-super-120b-a12b:free`: it bought from the honest seller and refused the sybil one. KIMI and Qwen themselves have not been run, so neither is claimed.
- **Chainlink CRE**: not built. Anyone can call `sweepRevoked`; the explorer lists ratings waiting for it.

## Status

| Piece | State |
|---|---|
| Contracts: receipts, router, reviewer passkeys, scoring, `sweepRevoked`, `GroundedGate` | Built, tested (64 unit/fuzz/invariant + 6 live-fork), slither clean of real findings |
| `Deploy.s.sol` | Built, rehearsed on an anvil fork of 10143 |
| `@sajalydv/grounded-sdk` and `@sajalydv/grounded-sdk/server` (402 paywall) | Built, 38 tests incl. fork tests against the live ERC-8004 registries and USDC |
| `apps/demo-seller`, `apps/demo-buyer` | Built; a buyer pays an honest agent and refuses a Sybil-inflated one, verified from a clean clone |
| `scripts/seed`, `scripts/seed census` | Built: seed demo data on a fork; read-only census of the live registry |
| Explorer and `GET /api/v1/agents/:id/score` (`apps/web`) | Built; reads live contracts, lists from `getLogs` |
| Docs (`/docs`) | Written: quickstart, SDK, scoring, contracts, 402, threat model, FAQ |
| **Testnet deploy**, `deployments/10143.json` | **Deployed 4 Oct** (block 68082112, rpId `grounded.sajal.sbs`); wiring verified on chain; the SDK uses these addresses by default |
| Playground (`/playground`), `BrowserPasskey`, `/api/drip` faucet | Built; browser E2E passes in real Chrome with a virtual WebAuthn authenticator. **Not tried on a real device** (Touch ID, phone), and no Privy email login: a browser-stored test wallet instead |
| AI: `@sajalydv/grounded-mcp` (read-only MCP tool), model-driven buyer (`demo-buyer agent`) | Built; tested with a scripted model and run once with a real model (OpenRouter free tier, on a fork); KIMI/Qwen not run, not claimed |
| `@sajalydv/grounded-sdk@0.1.0` on npm; seeded testnet agents 2118 (honest), 2119 (sybil), 2121 (wash rejected) | Done |
| Envio indexer | Not built |

Contracts are **unaudited and testnet-only**. Do not put real money behind them.
