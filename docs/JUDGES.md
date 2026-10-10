# Judge guide

Grounded: payment-grounded reputation for ERC-8004 agents on Monad Testnet (chain 10143). A rating counts only
if the reviewer paid the agent onchain, through `ReceiptRouter`, and signed with a passkey bound in
`ReviewerRegistry`. The score is a weighted median computed onchain by `GroundedReputation.scoreOf`.

## Links

| What | Where |
|---|---|
| Web app, explorer, docs | https://grounded.sajal.sbs (docs at `/docs`) |
| Score API | `GET https://grounded.sajal.sbs/api/v1/agents/:id/score` |
| SDK on npm | [`@sajalydv/grounded-sdk`](https://www.npmjs.com/package/@sajalydv/grounded-sdk) |
| Repo | https://github.com/ydvSajal/MONAD10K |

## Contracts (Monad testnet, deployed 4 Oct, block 68082112)

| Contract | Address |
|---|---|
| ReviewerRegistry | [`0xFb38DcB72C222d3943579b4F2c4C91ebcBE4eBa6`](https://testnet.monadscan.com/address/0xFb38DcB72C222d3943579b4F2c4C91ebcBE4eBa6) |
| ReceiptRegistry | [`0xa89b76Ea9AcEA12A66Fb23d318219b9119362301`](https://testnet.monadscan.com/address/0xa89b76Ea9AcEA12A66Fb23d318219b9119362301) |
| ReceiptRouter | [`0xab442c3cbc2997a6218FEA0DD253c3717edfc62e`](https://testnet.monadscan.com/address/0xab442c3cbc2997a6218FEA0DD253c3717edfc62e) |
| GroundedReputation | [`0xaDDd1f2F876CD253C57177b675905Bdb0061bF82`](https://testnet.monadscan.com/address/0xaDDd1f2F876CD253C57177b675905Bdb0061bF82) |

ERC-8004 registries used (not ours): Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation
`0x8004B663056A597Dffe9eCcC1965A193B7388713`. No contract has an owner, admin, pauser or upgrade proxy.

## Demo agents (seeded on testnet, 10 Oct)

| Agent | What happened | Grounded | Raw ERC-8004 |
|---|---|---|---|
| 2118 honest | 5 paying reviewers rated 85 to 95 | **90** | 90 |
| 2119 sybil | 2 paying reviewers rated 22 and 28, then 10 unpaid wallets posted 100 | **20** | 88 |
| 2121 wash | owner paid its own agent and tried to rate it: rejected (`ExcludedReviewer`); 1 real reviewer rated 60 | **60** | 60 |

Agent 2120 is an orphan from an interrupted seed run (registered, never rated).

## 5-minute path

1. **Score API** (10 s). The sybil agent: raw average 88, grounded 20.

   ```sh
   curl https://grounded.sajal.sbs/api/v1/agents/2119/score
   ```

2. **SDK from npm** (1 min). Addresses default to the testnet deploy.

   ```sh
   npm i @sajalydv/grounded-sdk viem
   ```

   ```js
   // t.mjs, run with: node t.mjs
   import { Grounded } from "@sajalydv/grounded-sdk";
   const g = new Grounded({ chain: "monad-testnet" });
   console.log(await g.score(2118n)); // score 90, 5 reviewers
   console.log((await g.check(2119n, { minScore: 70, minReviewers: 2 })).reasons); // [ 'score 20, policy wants 70' ]
   ```

3. **Explorer** (1 min). https://grounded.sajal.sbs/agents lists every agent with a Grounded rating. Open
   2119 to see each paid rating with its receipt and transaction.

4. **Onchain** (1 min). Read the score straight from the contract, no Grounded code involved:

   ```sh
   cast call 0xaDDd1f2F876CD253C57177b675905Bdb0061bF82 "meets(uint256,uint8,uint32)(bool)" 2119 70 2 --rpc-url https://testnet-rpc.monad.xyz   # false
   cast call 0xaDDd1f2F876CD253C57177b675905Bdb0061bF82 "meets(uint256,uint8,uint32)(bool)" 2118 70 2 --rpc-url https://testnet-rpc.monad.xyz   # true
   ```

5. **Full loop locally** (optional, about 10 min). The README Quickstart deploys to an anvil fork of testnet,
   seeds the three agents, runs a 402 seller and a buyer that pays the honest agent and refuses the sybil one.

## Honest limits

- Testnet only. Contracts are unaudited.
- Passkeys are verified onchain by the P256 precompile; a real hardware passkey on the hosted site has not been
  tested on a physical device. Seed and tests use a software authenticator.
- `ground` costs about 353k gas; `pay` about 302k (`docs/gas.md`).
