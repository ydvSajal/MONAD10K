# Outreach

Traction is 20% of the score (PRD §6). Targets: **≥1 external team with a testnet transaction using
the SDK**, and **≥3 teams that tried it**. Those need other people's time, so this cannot be done in
the last week.

Gates from the timeline: **24 Sep** two teams say "yes, will try it" · **28 Sep** one has the SDK
installed · **5 Oct** one is live.

## Rules

- 30 minutes a day, every day. Log every contact below, including the ones who said no.
- Offer to write their integration PR. It is two lines of SDK; doing it for them removes their excuse.
- Never claim more than is true. Right now: contracts built and tested, deploy imminent, SDK next week.
- One build-in-public post every 2–3 days. Those posts double as evidence of traction.

## Where the candidates actually are

I have not filled in names or handles, because inventing them would waste your 30 minutes a day on
dead ends. Pull real ones from these, then fill the table:

1. **The hackathon Discord / participant list** — teams building agents in this same event are the
   warmest lead by far. They need trust signals and they are already on 10143.
2. **ERC-8004 implementers** — anyone with a repo referencing the spec, or contributors to
   `erc-8004/erc-8004-contracts`. They already care about the identity and reputation layer.
3. **x402 / agent-payment builders** — the 402 paywall middleware is the natural hook, since they are
   already doing pay-per-call.
4. **Monad ecosystem agent projects** — check the ecosystem page and recent testnet deployers against
   the ERC-8004 registries (`Registered` events on `0x8004…BD9e` give you a live list of agent teams
   with wallets on this chain).
5. **Agent framework communities** — anywhere someone is shipping an agent that takes payments.

> The `Registered` event trick is the best of these: it is a list of teams that have *already*
> registered an ERC-8004 agent on Monad testnet. They are, by definition, the people this is for.

## Target list: registry census (refreshed 26 Sep)

Read from the live ERC-8004 identity registry (`0x8004…BD9e`) with `pnpm --filter @grounded/seed census`
(read-only, about a minute). It replaces the 23 Sep list, which covered 53 agents; the registry now
holds **1,930**.

**Do not read 1,930 as 1,930 teams.** What the data says:

| | |
|---|---|
| Agents / distinct owner addresses | 1,930 / 185 |
| Minted by 10 owners whose `agentURI` all point at one GitHub test-script repo (`…/mm-8004-contract/script/test-agents`) | 1,617 (84%) |
| Owned by `0x…0001` (26 agents, ids 919-957) | 26 |
| **Everything else** | **287 agents, 174 owners** |
| Agents with any ERC-8004 feedback | 84 (134 feedback clients in total, at most 12 on one agent) |

Two consequences:

1. **The "biggest operator on the registry, start here" row in the old list was wrong.** `0x0fd6…5D2e` (548
   agents) and six other big owners are one team's load test. One contact covers all of them, and none
   is a prospect. Treat them as a single low-priority lead.
2. **Real distinct teams are far fewer than 174.** Many teams register from many addresses (the Yiling
   agents alone use 18). My guess is 40-80 real teams; I cannot verify it from chain data.

Payout wallets: 1,026 agents have one, 904 do not. But **867 of the 904 belong to the test-script
minter.** Of the other 313 agents only 37 lack a wallet, and 206 of the 214 real agents registered since
id 1000 have one (983 wallets equal the owner address, so newer registrations appear to default the
wallet to the owner). The "no payout wallet" opener below now fits only old agents; the payout-wallet
fallback decision (Q9) is much less pressing than the 23 Sep census suggested.

### Where to start: named projects among the 287

Names come from each agent's own metadata (`agentURI`), so they are claims, not verified identities.
"Feedback" is the number of those agents that already have ERC-8004 feedback.

| Cluster (from metadata) | Owners | Agents | Feedback | Ids | Why it matters |
|---|---|---|---|---|---|
| Yiling Analyst Agent, `yilingprotocol.com` | 18 | 32 | 17 | 1720-1757 | Most feedback of any team; one team, many addresses. Pick one contact |
| `mandate.ibxlab.xyz` | 11 | 48 | 5 | 1831-1898 | Biggest real deployment |
| "Outside agent (e2e)" | 9 | 9 | 4 | 1899-1926 | Look like other hackathon teams testing end to end |
| `agenttrust.local`, `raterproof.xyz`, TrustLens, `crosscheck.io`, `verdict.invalid`, `backstop-smoky.vercel.app` | 1-3 each | 1-9 each | some | 1758-1930 | Names suggest trust or rating projects: competitors or integrators, check before pitching |
| Builder-A, GlassAgent, Veridex, Spark Harness, Data Market Broker, Merchant Wm1 | 1-4 each | 2-5 each | some | various | Single named agents, easy first messages |
| `Sim-Agent-*` | 26 | 26 | 6 | 166-307 | Simulation agents from one script: one low-priority lead |

Find the person behind a cluster before messaging (its site, the hackathon Discord, X) and log every contact in the Log table below.

Status values: `not contacted` · `contacted` · `replied` · `said yes` · `SDK installed` · `live` · `declined`

### The "your agent cannot be paid" opener (old agents only)

Only agents from the early registry era lack a payout wallet. If one of them is a real team, this still
opens a conversation without a pitch:

> Your agent on the Monad ERC-8004 registry has no payout wallet set, so `getAgentWallet` returns
> zero and payments to it revert. Fix is one call, `setAgentWallet`, signed by the wallet you want
> paid. I noticed because I am building payment-grounded reputation on top of that registry — happy
> to show you if it is useful, but the wallet thing is worth fixing either way.

## Message templates

### Cold, in a hackathon channel

> Building Grounded for Metropolis: reputation for ERC-8004 agents where a rating only counts if the
> reviewer actually paid the agent onchain. No self-attested reviews.
>
> Looking for one agent team to be the first integrator. It is two lines to gate on trust:
>
> ```ts
> const g = new Grounded({ chain: "monad-testnet" });
> if (!(await g.check(agentId, { minScore: 70, minReviewers: 5 })).pass) return;
> ```
>
> Happy to write the PR for you. What are you building?

### Direct, to a team with an ERC-8004 agent on testnet

> Saw you registered an agent on the ERC-8004 registry on Monad testnet. I am building the layer that
> decides which feedback deserves belief: a rating only counts if the reviewer paid your agent
> onchain, so nobody can spray fake reviews at you from throwaway wallets.
>
> Would you try it? I will write the integration and you keep it only if it is useful.

### Follow-up, after two days of silence

> Following up once, then I will leave you alone. If it is easier, send me a repo link and I will
> open the PR myself — you review it, merge it or close it.

### The ask that actually converts

Do not ask "would you be interested". Ask for one specific thing: a repo link, or 15 minutes to pair.

## Build-in-public log

| Date | Platform | Link | Angle |
|---|---|---|---|
|  |  |  |  |

Angles that are genuinely interesting, and true:
- The P256 precompile verifying a real passkey onchain, 148k gas.
- Finding that the score kept counting revoked feedback, and fixing it with a permissionless sweep.
- Why trimming was removed from the scoring: it cannot move a weighted median, so it was pure gas.
- Honest post: a passkey is not proof of personhood, and payment is what actually stops sybils.

## Log

Every contact, newest first. Include the ones that went nowhere.

| Date | Who | Channel | What happened |
|---|---|---|---|
|  |  |  |  |
