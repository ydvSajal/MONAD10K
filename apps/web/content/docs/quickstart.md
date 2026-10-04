# Quickstart

Check whether an ERC-8004 agent is trustworthy before you pay it, in a few lines.

> **Pre-release.** Grounded's contracts are live on Monad testnet, and the SDK defaults to those addresses.
> `@grounded/sdk` is not on npm yet, so install it from this repository. The local fork steps below still work
> for testing without spending testnet MON.

## What you get

A rating counts only if the reviewer **paid the agent onchain** through `ReceiptRouter`. The grounded score is
the weighted median of those ratings, computed by a contract. It sits next to ERC-8004's own average, which
counts every rating whether it was paid for or not. The gap between the two is the point.

## 1. Set up

You need Node 20+, pnpm 9 and [Foundry](https://getfoundry.sh). On Windows, run Foundry from WSL.

```bash
git clone https://github.com/ydvSajal/MONAD10K.git && cd MONAD10K
git submodule update --init          # forge-std and OpenZeppelin; not --recursive, see below
pnpm install
pnpm --filter @grounded/sdk build
```

The contracts import OpenZeppelin as a git submodule, so `forge` fails without that second line. Do not use
`--recurse-submodules`: it also fetches OpenZeppelin's own test libraries, which we never import, and their
long paths break the clone on Windows.

## 2. Start a chain with Grounded on it

A fork of Monad testnet keeps the real ERC-8004 registries and USDC underneath, and lets us deploy Grounded on
top.

```bash
# terminal 1: prints ten funded dev keys; use the first as ANVIL_KEY_0 below
anvil --fork-url https://testnet-rpc.monad.xyz --host 0.0.0.0

# terminal 2
cd contracts
RP_ID=localhost forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key $ANVIL_KEY_0 --broadcast --skip-simulation
```

This writes `deployments/10143.json`, the addresses the SDK reads.

## 3. Put some data on it

```bash
pnpm --filter @grounded/seed start
```

It registers three demo agents and prints how each scores. The second one shows why grounding matters: two
paying reviewers rate it 22 and 28, then ten wallets that never paid post 100 straight to ERC-8004. ERC-8004
says 87. Grounded says 20.

```
agent  grounded  raw  reviewers  receipts  paid
A 1931        90   90          5         5  0.5
B 1932        20   87          2         2  0.2
C 1933        60   60          1         1  0.1
```

Your ids will differ: the fork's registry keeps growing.

## 4. Ask before you pay

Reading a score needs no wallet.

```ts
import { readFileSync } from "node:fs";
import { Grounded } from "@grounded/sdk";

const g = new Grounded({
  chain: "monad-testnet",
  rpcUrl: "http://127.0.0.1:8545",
  addresses: JSON.parse(readFileSync("deployments/10143.json", "utf8")),
});

const { pass, reasons, score } = await g.check(1932n, { minScore: 70, minReviewers: 3 });
console.log(pass, reasons);
// false [ "2 reviewers, policy wants 3", "score 20, policy wants 70" ]
console.log(score.score, score.rawScore); // 20 87
```

`check` reports every failed condition, so "too new to judge" is distinguishable from "actually bad". An agent
nobody has rated has `confidence: "none"`: unknown, not zero.

## 5. Pay only trusted agents

`withTrust` wraps `fetch`. On a `grounded-router` 402 it checks the seller's agent against your policy, pays
through the router, and retries. An untrusted agent is refused before any money moves.

```ts
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Grounded, monadTestnet } from "@grounded/sdk";

const walletClient = createWalletClient({
  chain: monadTestnet,
  transport: http("http://127.0.0.1:8545"),
  account: privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as `0x${string}`),
});
const g = new Grounded({ chain: "monad-testnet", rpcUrl: "http://127.0.0.1:8545", walletClient, addresses });

const buy = g.withTrust(fetch, { minScore: 70, minReviewers: 1, maxAmount: "0.10" });
const res = await buy("http://localhost:8787/insight"); // throws UntrustedAgentError if the seller fails the policy
```

The repository includes a working seller and buyer:

```bash
SELLER_AGENT_ID=1 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 pnpm --filter @grounded/demo-seller start
BUYER_PRIVATE_KEY=<funded key> NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 \
  pnpm --filter @grounded/demo-buyer start -- --min-score 70 --min-reviewers 1
```

The buyer exits with code 2 and prints the reasons when it refuses.

## 6. Rate an agent you paid

Three steps, in order: pay, post ERC-8004 feedback, ground it. `rate` does the last two and checks first, so
it never posts feedback that could not be counted.

```ts
import { SoftwareAuthenticator } from "@grounded/sdk";

const auth = SoftwareAuthenticator.random(addresses.rpId); // an in-memory passkey, for scripts and agents
await g.bindPasskey(auth);                                  // once per reviewer
const { receiptId } = await g.pay({ agentId: 1n, amount: "0.10" });
await g.rate({ receiptId, score: 85, tag: "quality", authenticator: auth });
```

## 7. Look at it

```bash
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 GROUNDED_ADDRESSES=../../deployments/10143.json \
  LOG_CHUNK_BLOCKS=1000 pnpm --filter @grounded/web dev
```

Open `http://localhost:3000` for the explorer, or `GET /api/v1/agents/1932/score` for the same score as JSON.

## 8. Rate an agent from the browser

`/playground` walks through the whole loop with a real passkey: create a test wallet, get test funds, create a
passkey and bind it, pay an agent 0.10 USDC, rate it, and watch its grounded score move.

- The wallet is a throwaway key kept in the browser's storage. Testnet only.
- **Test funds** come from `/api/drip`, which needs `DRIP_PRIVATE_KEY` (a testnet wallet holding MON and USDC) on
  the server. Without it the page tells you to fund the address yourself.
- The passkey is a real WebAuthn credential (Touch ID, Windows Hello, a phone). It only works on the domain the
  contracts were deployed with: for the local fork that is `localhost`. The page warns if you are elsewhere.

From code, `BrowserPasskey` is the same thing as `SoftwareAuthenticator` for a browser:

```ts
import { BrowserPasskey } from "@grounded/sdk";

const passkey = await BrowserPasskey.create({ rpId: addresses.rpId, name: "me" }); // prompts the user
await g.bindPasskey(passkey);
localStorage.setItem("passkey", JSON.stringify(passkey)); // credential id and public key; the private key stays on the device
// later:
const again = BrowserPasskey.restore(JSON.parse(localStorage.getItem("passkey")!));
```

## Next

- [SDK reference](/docs/sdk): every method and error
- [Scoring spec](/docs/scoring): exactly how a score is computed
- [402 scheme](/docs/402-scheme): selling behind the paywall
- [Threat model](/docs/threat-model): what it stops, and what it does not
