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

## Target list

Fill in as you go. Aim for 20 rows.

| # | Team / project | Where found | Contact | Status | Last touch | Next step |
|---|---|---|---|---|---|---|
| 1 |  |  |  | not contacted |  |  |
| 2 |  |  |  | not contacted |  |  |
| 3 |  |  |  | not contacted |  |  |

Status values: `not contacted` · `contacted` · `replied` · `said yes` · `SDK installed` · `live` · `declined`

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
- The P256 precompile verifying a real passkey onchain, 158k gas.
- Finding that the score kept counting revoked feedback, and fixing it with a permissionless sweep.
- Why trimming was removed from the scoring: it cannot move a weighted median, so it was pure gas.
- Honest post: a passkey is not proof of personhood, and payment is what actually stops sybils.

## Log

Every contact, newest first. Include the ones that went nowhere.

| Date | Who | Channel | What happened |
|---|---|---|---|
|  |  |  |  |
