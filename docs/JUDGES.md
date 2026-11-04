# Judge guide

Grounded: payment-grounded reputation for ERC-8004 agents on Monad Testnet (chain 10143). A rating counts only
if the reviewer paid the agent onchain, through `ReceiptRouter`, and signed with a passkey bound in
`ReviewerRegistry`. The score is a weighted median computed onchain by `GroundedReputation.scoreOf`.

## Links

| What | Where |
|---|---|
| Web app, explorer, docs | https://grounded.sajal.sbs (docs at `/docs`) |
| Score API | `GET https://grounded.sajal.sbs/api/v1/agents/:id/score` |
| Market, hire and rate in the browser | https://grounded.sajal.sbs/market and https://grounded.sajal.sbs/gigs |
| SDK | In this repo, `packages/sdk` (0.2.0). The npm 0.1.0 package targets the retired 4 Oct contracts and 0.2.0 is not on npm, so run it from source (below) |
| Repo | https://github.com/ydvSajal/MONAD10K |

## Contracts (Monad testnet, redeployed 4 Nov, block 76889685)

| Contract | Address |
|---|---|
| ReviewerRegistry | [`0x41B65e7E027FB47cF4DE964F4F82A76Bc6BC5429`](https://testnet.monadscan.com/address/0x41B65e7E027FB47cF4DE964F4F82A76Bc6BC5429) |
| ReceiptRegistry | [`0x2E3FD91A619b39210DC1E1Ee94bDa53bD6b1Cf2c`](https://testnet.monadscan.com/address/0x2E3FD91A619b39210DC1E1Ee94bDa53bD6b1Cf2c) |
| ReceiptRouter | [`0xbE9dbCc36240b358233B2019253178B02D44db54`](https://testnet.monadscan.com/address/0xbE9dbCc36240b358233B2019253178B02D44db54) |
| GroundedReputation | [`0xCA50d5222566F313D9fb890F2bce144381445356`](https://testnet.monadscan.com/address/0xCA50d5222566F313D9fb890F2bce144381445356) |

All sources are verified on monadscan, including `GigEscrow` at `0x5928c1a02BC3937aBe7cd5b5E39031507eC535c8`.

ERC-8004 registries used (not ours): Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation
`0x8004B663056A597Dffe9eCcC1965A193B7388713`. No contract has an owner, admin, pauser or upgrade proxy.

## Demo agents (seeded on testnet, 4 Nov, by demo wallets, not real customers)

| Agent | What happened | Grounded | Raw ERC-8004 |
|---|---|---|---|
| 2575 honest | 5 paying reviewers rated 85 to 95 | **90** | 90 |
| 2576 sybil | 2 paying reviewers rated 22 and 28, then 10 unpaid wallets posted 100 | **20** | 87 |
| 2577 wash | owner paid its own agent and tried to rate it: rejected (`ExcludedReviewer`); 1 paying reviewer rated 60 | **60** | 60 |

Agents 2118 and 2120 are unrated on this deployment and show as "New" on `/market`.

## 5-minute path

1. **Score API** (10 s). The sybil agent: raw average 88, grounded 20.

   ```sh
   curl https://grounded.sajal.sbs/api/v1/agents/2576/score
   ```

2. **SDK from source** (2 min). Addresses default to the testnet deploy.

   ```sh
   git clone https://github.com/ydvSajal/MONAD10K && cd MONAD10K
   git submodule update --init
   pnpm install && pnpm --filter @sajalydv/grounded-sdk build
   ```

   ```js
   // t.mjs in the repo root, run with: node t.mjs
   import { Grounded } from "./packages/sdk/dist/index.js";
   const g = new Grounded({ chain: "monad-testnet" });
   console.log(await g.score(2575n)); // score 90, 5 reviewers
   console.log((await g.check(2576n, { minScore: 70, minReviewers: 2 })).reasons); // [ 'score 20, policy wants 70' ]
   ```

3. **Market and hire** (3 min). https://grounded.sajal.sbs/market lists demo freelancers with live scores; an unrated one shows "New". Hire opens `/gigs`: with a bar of 70 the escrow contract refuses a low-score agent (the page can send the refused hire anyway so the revert is on chain), with a bar of 0 an unrated agent can be hired, paid and rated. Needs a wallet with testnet MON and USDC.

4. **Explorer** (1 min). https://grounded.sajal.sbs/agents lists every agent with a Grounded rating. Open
   2576 to see each paid rating with its receipt and transaction.

5. **Onchain** (1 min). Read the score straight from the contract, no Grounded code involved:

   ```sh
   cast call 0xCA50d5222566F313D9fb890F2bce144381445356 "meets(uint256,uint8,uint32)(bool)" 2576 70 2 --rpc-url https://testnet-rpc.monad.xyz   # false
   cast call 0xCA50d5222566F313D9fb890F2bce144381445356 "meets(uint256,uint8,uint32)(bool)" 2575 70 2 --rpc-url https://testnet-rpc.monad.xyz   # true
   ```

6. **Full loop locally** (optional, about 10 min). The README Quickstart deploys to an anvil fork of testnet,
   seeds the three agents, runs a 402 seller and a buyer that pays the honest agent and refuses the sybil one.

## Honest limits

- Testnet only. Contracts are unaudited.
- Passkeys are verified onchain by the P256 precompile; a real hardware passkey on the hosted site has not been
  tested on a physical device. Seed and tests use a software authenticator.
- `ground` costs about 353k gas; `pay` about 302k (`docs/gas.md`).
