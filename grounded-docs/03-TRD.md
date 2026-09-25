# Grounded — Technical Requirements Document (v1)

Implementation spec. Written for humans and coding agents: imperative, exact names, exact paths.
Companion: `04-SYSTEM-ARCHITECTURE.md` (layout, flows), `05-DEPLOYMENT-AND-REQUIREMENTS.md` (env, infra).

## 1. Global constraints

- Solidity `0.8.24`+ (match OZ pin), Foundry. TypeScript strict, Node 20+, pnpm workspaces, viem.
- **No owner, admin, pauser, or upgrade proxy** in any contract. All config is `immutable` or `constant`.
- All scoring parameters are `constant` in `ScoringLib` and mirrored verbatim in the docs scoring spec.
- Custom errors only (no revert strings). Events for every state change.
- Monad bills declared gas limit: SDK sets per-call limits from measured gas × 1.15.
- Never call ERC-8004 `giveFeedback` from a Grounded contract.

## 2. Contracts

Directory: `contracts/src/`

### 2.1 Types (`types/GroundedTypes.sol`)

```solidity
enum ReceiptStatus { None, Issued, Consumed }

struct Receipt {
    uint256 agentId;
    address payer;
    address token;
    uint96  amount;   // token base units
    uint40  paidAt;
    ReceiptStatus status;
}

struct WebAuthnSig {
    bytes   authenticatorData;
    string  clientDataJSON;
    uint256 challengeIndex;
    uint256 typeIndex;
    uint256 r;
    uint256 s;
}

struct Score {
    uint8   median;          // 0..100 (bucket * 5)
    uint32  reviewers;       // live unique reviewers
    uint32  receipts;        // consumed receipts, all time
    uint128 paid;            // normalised 6 decimals, all time
    uint64  weightMass;      // sum of live weights
    uint40  updatedAt;
    uint40  ownerChangedAt;
}
```

### 2.2 `ReceiptRegistry`

- `constructor(address router_, address reputation_)` — set once; `router` and `grounded` immutable. Deploy order handled via CREATE address precompute in the deploy script.
- `issue(Receipt calldata) returns (uint256 id)` — `onlyRouter`. Ids are sequential from 1.
- `consume(uint256 id)` — `onlyGrounded`; requires `status == Issued` and `block.timestamp <= paidAt + RECEIPT_TTL`.
- `get(uint256 id) view returns (Receipt memory)`; `isValid(id) view returns (bool)`.
- `RECEIPT_TTL = 30 days`.
- Errors: `NotRouter()`, `NotGrounded()`, `ReceiptNotIssued(id)`, `ReceiptExpired(id)`.

### 2.3 `ReceiptRouter`

- `constructor(IIdentityRegistry id_, ReceiptRegistry receipts_, address[] tokens_)` — allowlist immutable (store as mapping set in constructor; no setter).
- `MIN_AMOUNT_6DP = 10_000` (0.01 USDC). Normalise by token decimals (read once in constructor, store).
- `pay(uint256 agentId, address token, uint256 value) returns (uint256 receiptId)`
  1. token allowed, value ≥ min.
  2. `to = identity.getAgentWallet(agentId)`; revert `NoAgentWallet(agentId)` if zero.
  3. `SafeERC20.safeTransferFrom(msg.sender, to, value)` — payer = `msg.sender`.
  4. `receipts.issue(...)`, emit `ReceiptIssued`.
- `payWithAuthorization(agentId, token, from, value, validAfter, validBefore, salt, sig)`
  1. same checks; `to = getAgentWallet(agentId)`.
  2. call `IERC3009(token).receiveWithAuthorization(from, router, value, validAfter, validBefore, authorizationNonce(agentId, salt), v, r, s)` (split `sig`), then forward `value` to `to`. The payer signs a *Receive* authorization with the router as payee: USDC lets only the payee redeem it, so it cannot be front-run straight into the token (money moved, no receipt). `authorizationNonce = keccak256(abi.encode(agentId, salt))`, so it cannot be relayed to another agent. The router holds the funds only within the call.
  3. receipt payer = `from` (not `msg.sender`).
- Router never holds balances. Add invariant test: token balance of router == 0 always.
- Follow checks-effects-interactions; receipt issued after successful transfer in the same tx.

### 2.4 `ReviewerRegistry`

- `bind(uint256 qx, uint256 qy, WebAuthnSig calldata proof)`
  - challenge = EIP-712 hash of `Bind{ reviewer: msg.sender, qx, qy, nonce: nonces[msg.sender], chainId }`.
  - verify via `GroundedWebAuthn.verify(challenge, proof, qx, qy, requireUV=true)`.
  - `keyHash = keccak256(qx, qy)`; revert `KeyAlreadyBound` if mapped to another reviewer. Rebinding by same reviewer allowed (key rotation) → clears old keyHash mapping, increments nonce.
- `keyOf(address) view returns (uint256 qx, uint256 qy)`; `reviewerOf(bytes32 keyHash)`.
- **Fallback (only if 21 Sep kill switch fires):** `bindWithWallet(bytes32 keyHash, bytes sig)` using EIP-712 ECDSA; `ground` then verifies an ECDSA sig from the reviewer. Keep behind a separate contract version, not a flag.

### 2.5 `GroundedReputation`

`ground(uint256 receiptId, uint64 feedbackIndex, uint40 deadline, WebAuthnSig calldata sig)`

Check order (cheapest first; each has a custom error and a test):
1. `block.timestamp <= deadline` → `Expired()`.
2. `r = receipts.get(receiptId)`; `r.status == Issued`, not past TTL → `BadReceipt()`.
3. `r.payer == msg.sender` → `NotPayer()`.
4. Exclusions via Identity Registry: `msg.sender != ownerOf(agentId)`, `!= getApproved(agentId)`, `!isApprovedForAll(owner, msg.sender)`, `!= getAgentWallet(agentId)` → `ExcludedReviewer()`.
5. Read feedback `(agentId, msg.sender, feedbackIndex)` from ERC-8004 Reputation Registry. Require exists, not revoked, `tag1 == "quality"` (compare `keccak256(bytes(tag1))` to constant hash; `"dispute"` counted in a separate counter), value in `[0,100]` → `BadFeedback()`.
   - **Day-1 verify:** the deployed ABI's read function name and value type. If value is `int128` with `valueDecimals`, require `valueDecimals == 0`. Put the adapter in `adapters/Erc8004Adapter.sol` so only one file changes.
6. Key: `(qx, qy) = reviewers.keyOf(msg.sender)`, nonzero → `NoPasskey()`.
7. Challenge = EIP-712 `Ground{receiptId, agentId, feedbackIndex, score, tagHash, reviewer, chainId, deadline}`; `GroundedWebAuthn.verify(challenge, sig, qx, qy, true)` → `BadSignature()`.
8. Effects: `receipts.consume(receiptId)`; if reviewer has live rating for agent, remove its `(bucket, weight)` from histogram; add new; update `Score`; emit `Grounded`.

Views:
- `scoreOf(uint256 agentId) returns (Score memory)` — computes median from histogram on read.
- `meets(uint256 agentId, uint8 minScore, uint32 minReviewers) returns (bool)`.
- `liveRating(uint256 agentId, address reviewer) returns (uint8 bucket, uint8 weight)`.
- `disputeCount(uint256 agentId) returns (uint32)`.

`ownerChangedAt`: record lazily — store `lastOwner[agentId]`; on each `ground`, if `ownerOf != lastOwner`, set `ownerChangedAt = now`. Document that it updates on the next rating, not instantly (the indexer shows the exact transfer time from `Transfer` events).

Storage: `mapping(uint256 => uint64[21]) histogram`, `mapping(uint256 => mapping(address => Live)) live` where `Live {uint8 bucket; uint8 weight; bool exists;}` packed.

### 2.6 ERC-8004 registries (only if A1 fails)
Deploy the reference Identity + Reputation contracts at pinned commit via `script/DeployErc8004.s.sol`. Record in `deployments/10143.json` with `"erc8004Source": "self-deployed"`. The explorer and docs must say so.

### 2.7 `GroundedGate` (helper)
```solidity
abstract contract GroundedGate {
    IGroundedReputation public immutable grounded;
    uint8  public immutable minScore;
    uint32 public immutable minReviewers;
    error AgentNotTrusted(uint256 agentId);
    modifier onlyTrusted(uint256 agentId) {
        if (!grounded.meets(agentId, minScore, minReviewers)) revert AgentNotTrusted(agentId);
        _;
    }
}
```

## 3. Passkey verification (`lib/GroundedWebAuthn.sol`)

### 3.1 Implementation
- Wrap OpenZeppelin `WebAuthn` library (pin a release whose verify path calls the P256 precompile directly; record exact tag in `foundry.toml` comment). If the pinned version routes through a Solidity fallback, call precompile `0x0100` ourselves: 160-byte input `(hash, r, s, qx, qy)`, success = 32-byte return with value 1, empty return = failure, 6,900 gas.
- Required checks: `type == "webauthn.get"` at `typeIndex`; challenge (base64url) at `challengeIndex`; `authenticatorData[0:32] == RP_ID_HASH`; UP flag (bit 0) set; UV flag (bit 2) set; `s <= n/2`; ignore signCount.
- `signedHash = sha256(authenticatorData || sha256(bytes(clientDataJSON)))`.

### 3.2 rpId
- `RP_ID_HASH = sha256(bytes(RP_ID))` is an **immutable constructor arg** of `ReviewerRegistry` and `GroundedReputation`.
- `RP_ID` = production web domain, locked 17 Sep. All passkey testing happens on that domain (or `localhost` against a local deployment with `RP_ID=localhost`).

### 3.3 Client side
- Browser: `ox` `WebAuthnP256.createCredential` (bind) / `WebAuthnP256.sign` (ground) with `userVerification: "required"`. Map `metadata` → `WebAuthnSig`.
- Headless: `SoftwareAuthenticator` in SDK — P256 key from `ox/P256`, builds `authenticatorData` (rpIdHash + flags 0x05 + counter 0) and `clientDataJSON` itself, signs `signedHash`. Docs must state the contract cannot distinguish this from hardware.

## 4. Scoring (`lib/ScoringLib.sol`)

Constants:
```
BUCKETS            = 21          // 0,5,...,100
BUCKET_SIZE        = 5
WEIGHT_CAP         = 4
WEIGHT_UNIT_6DP    = 100_000     // 0.10 USDC
MIN_REVIEWERS_OK   = 5
RECEIPT_TTL        = 30 days
MIN_AMOUNT_6DP     = 10_000      // 0.01 USDC
```

Functions:
- `bucketOf(uint8 score) = (score + 2) / 5` (round half up).
- `weightOf(uint96 amount6dp) = min(1 + floorLog2(1 + amount6dp / WEIGHT_UNIT_6DP), WEIGHT_CAP)` — `floorLog2` via OZ `Math.log2`.
  - 0.01–0.09 → 1 · 0.10–0.29 → 2 · 0.30–0.69 → 3 · ≥ 0.70 → 4.
- `median(uint64[21] h, uint64 mass)`: walk buckets; return first bucket `i` where cumulative weight × 2 ≥ mass; `median = i * 5`. Mass 0 → median 0, confidence `none`.

**Spec delta — trimming removed.** Dropping equal weight shares from both tails never changes a weighted median, so the 10% trim adds gas with zero effect. Robustness comes from the median itself + weight cap + one live rating per reviewer.

Confidence (computed in SDK, not stored): `none` (0 reviewers), `low` (< 5), `ok` (≥ 5).

Tests: fuzz `median` against a reference that expands weights into a sorted array; property: adding a rating then replacing it with the same values leaves state identical.

## 5. SDK (`packages/sdk`, npm `@grounded/sdk` — check scope availability day 6; fallback `@<org>/grounded`)

```ts
type ChainName = "monad-testnet";
interface GroundedConfig {
  chain: ChainName;
  rpcUrl?: string;
  indexerUrl?: string;
  walletClient?: WalletClient;   // viem; required for writes
  addresses?: Partial<Addresses>; // override for local anvil
}

class Grounded {
  constructor(cfg: GroundedConfig);
  score(agentId: bigint): Promise<ScoreResult>;
  check(agentId: bigint, policy: TrustPolicy): Promise<CheckResult>;
  withTrust(f: typeof fetch, policy: TrustPolicy & PayOptions): typeof fetch;
  pay(args: { agentId: bigint; amount: string; token?: Address; mode?: "transfer" | "authorization" }): Promise<{ receiptId: bigint; txHash: Hash }>;
  bindPasskey(auth: Authenticator): Promise<Hash>;
  rate(args: { receiptId: bigint; score: number; tag: "quality" | "dispute"; authenticator: Authenticator; deadlineSec?: number }): Promise<{ feedbackTx: Hash; groundTx: Hash }>;
}

interface ScoreResult {
  agentId: bigint; score: number; rawScore: number | null;
  reviewers: number; receipts: number; paid: string;
  confidence: "none" | "low" | "ok"; ownerChangedAt: Date | null; disputes: number;
}
interface TrustPolicy { minScore: number; minReviewers: number; ratingsAfterOwnerChange?: boolean }
interface CheckResult { pass: boolean; reasons: string[]; score: ScoreResult }

type Authenticator = BrowserPasskey | SoftwareAuthenticator;

// server entry: @grounded/sdk/server
function groundedPaywall(opts: { agentId: bigint; price: string; token?: Address; store: ReceiptStore }): MiddlewareHandler;
interface ReceiptStore { markUsed(receiptId: bigint): Promise<boolean> } // false if already used
```

Rules:
- Validate inputs with `zod` at the SDK boundary (score 0–100 integer, amount ≥ 0.01).
- Typed errors: `UntrustedAgentError`, `ReceiptAlreadyUsedError`, `NoPasskeyBoundError`, `ContractRevertError` (decoded custom error name).
- `rate()` sends `giveFeedback` then `ground`, waits for the first receipt, reads the new `feedbackIndex` from the event (don't guess it).
- Per-call gas limits in `gas.ts` from the gas report.
- Builds: ESM + CJS via `tsup`; `sideEffects: false`; browser entry has no Node imports.

## 6. 402 scheme `grounded-router`

Seller response when unpaid:
```json
HTTP 402
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "grounded-router",
    "network": "eip155:10143",
    "asset": "<USDC address>",
    "amount": "50000",
    "payTo": "<ReceiptRouter address>",
    "extra": { "agentId": "12", "receiptRegistry": "<address>" }
  }]
}
```

Client retry header: `X-GROUNDED-RECEIPT: base64(json{ receiptId, payer, url, method, iat, sig })` where `sig` = payer EIP-712 signature over `{receiptId, url, method, iat}`.

Seller verification (`groundedPaywall`):
1. `iat` within 120 s. 2. Recover signer == `payer`. 3. `ReceiptRegistry.get(receiptId)`: `payer` matches, `agentId` matches, `amount ≥ price`, token matches, status `Issued` or `Consumed` (rating doesn't revoke access). 4. `store.markUsed(receiptId)` must return true. 5. `next()`.

Store: Neon Postgres table `used_receipts(receipt_id numeric primary key, used_at timestamptz)` (`INSERT ... ON CONFLICT DO NOTHING` → rowCount).

## 7. Indexer (Envio HyperIndex, `indexer/`)

Events: `ReceiptIssued`, `ReviewerBound`, `Grounded` (ours); `Registered`, `Transfer` (Identity); `NewFeedback`, `FeedbackRevoked` (Reputation — confirm event names from ABI day 1). `start_block` = our deploy block (and ERC-8004 deploy block).

Entities: `Agent{id, owner, wallet, ownerChangedAt, rawCount, groundedCount, paidTotal}`, `Receipt{id, agent, payer, amount, paidAt, consumed}`, `Reviewer{address, keyHash, boundAt}`, `Feedback{agent, client, index, value, tag1, revoked, grounded}`, `GroundedRating{agent, reviewer, receipt, score, weight, ts}`.

Rule: the indexer is **advisory**. The explorer shows the grounded score from `scoreOf` (onchain), never a recomputed indexer value.

## 8. Web (`apps/web`, Next.js App Router)

Routes: `/` (landing + live counters) · `/agents` · `/agents/[id]` (raw vs grounded) · `/reviewers/[address]` · `/playground` · `/docs/*` (Fumadocs) · `/api/v1/agents/[id]/score` (GET, cache 15 s, rate limit 60/min/IP) · `/api/drip` (POST, Privy-authenticated, 1 drip per user per 24 h, fixed small amounts).

Drip wallet: testnet-only key in Vercel encrypted env; no roles in any contract; balance alarm; documented in README "Keys we hold and why".

## 9. Test plan

| Layer | Tooling | Must cover |
|---|---|---|
| Unit | forge | every custom error path in §2 |
| Fuzz | forge | ScoringLib median/weight; router amounts/decimals |
| Invariant | forge | receipt consumed at most once; histogram mass == Σ live weights; router balance == 0 |
| Fork | forge `--fork-url` testnet | P256 precompile with real assertion; USDC EIP-3009 domain `"USDC"`; ERC-8004 adapter reads |
| Static | Slither, Aderyn | no high/medium open |
| SDK | vitest + anvil | pay/rate/check; error decoding; paywall replay + stolen-receipt rejection |
| E2E | Playwright (virtual authenticator) | playground happy path |
| Manual | device matrix | see timeline 1 Oct |
| Secrets | gitleaks (CI + full history) | zero findings |

Gas: `forge test --gas-report` output committed to `docs/gas.md`; SDK limits derived from it.

## 10. Security requirements

- No privileged roles in contracts (T12). Deployer key in Foundry keystore, discarded after deploy.
- Replay: receipt single-use + chainId + deadline + reviewer in challenge (T5). Low-s (T6).
- Exclusions (T2), dust floor (§2.3), weight cap (T4).
- Seller receipts require payer signature + single use (§6).
- API: rate limiting, zod validation, no secrets client-side, CORS open for GET score only.
- Privacy (T9): SDK docs recommend a dedicated rating wallet; ZK receipts on roadmap.
