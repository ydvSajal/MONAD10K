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

## Target list — 21 real teams, pulled off chain (23 Sep)

Enumerated `ownerOf` / `getAgentWallet` for agent ids 1-53 on the live ERC-8004 identity registry.
These are addresses that have **already registered an agent on Monad testnet**: the exact audience.

You still have to find the human behind each address. The practical routes: search the address on the
hackathon Discord and on X, check whether it resolves to an ENS or a known deployer, and look at the
agent's `tokenURI` / `agentURI`, which often carries a name, website or contact.

"Payable" means the agent has a payout wallet set, so `pay()` works today. A team marked **no wallet**
cannot receive a payment until they call `setAgentWallet` — see the note below, it is also a warm
opener ("your agent cannot be paid, here is the one-liner to fix it").

| # | Owner address | Agents | Payable | Contact | Status | Next step |
|---|---|---|---|---|---|---|
| 1 | `0x0fd6B881b208d2b0b7Be11F1eB005A2873dD5D2e` | 27-42, 49-53 (19) | no wallet |  | not contacted | biggest operator on the registry — start here |
| 2 | `0x567bDc4086eFc460811798d1075a21359E34072d` | 14-17 | yes |  | not contacted | only owner using distinct payout wallets — sophisticated |
| 3 | `0xFcCf1a167790d6657Eed65173DB9d4eB546AB7E8` | 23, 46-48 | no wallet |  | not contacted |  |
| 4 | `0x949a537aFdcc2958edeC473Ce8C040E31EA6EE2B` | 18-20 | yes |  | not contacted |  |
| 5 | `0xf043B0d473a2EDD7C5D6F4d931334096B77A7EDC` | 2, 3 | yes |  | not contacted |  |
| 6 | `0xa05Dd22AB6494Cf7743b60F991fE48A817e28Fa2` | 4, 5 | yes |  | not contacted |  |
| 7 | `0xC799F507cB3257d9332719D93f0311377803eaB1` | 6, 7 | yes |  | not contacted |  |
| 8 | `0x72a4d3cC389121c911B3A72BD4d495D3D640ad00` | 11, 12 | yes |  | not contacted |  |
| 9 | `0x528110a09322B47409bCec7DB3484Be94e88b0AD` | 44, 45 | no wallet |  | not contacted |  |
| 10 | `0xf50B97A486323d51f5b75749E27f7784C32FCcAf` | 30, 51 | no wallet |  | not contacted |  |
| 11 | `0x133603465aDdE7C39fa0E6E34b264E1573e1FD08` | 1 | yes |  | not contacted | agent 1, our fork tests already pay it |
| 12 | `0xBa01864b0303d00a112E2F6a6D3B2E402D903620` | 8 | yes |  | not contacted |  |
| 13 | `0x1F36B4c388CA19Ddb5b90DcF6E8f8309652Ab3dE` | 9 | yes |  | not contacted |  |
| 14 | `0x6cCBe5f5Cf80f66a0ef286287e2A75e4aFec7Fbf` | 10 | yes |  | not contacted |  |
| 15 | `0xb6E8B2692cdc3A31280DCa8E9C8b88bb5e436f24` | 13 | yes |  | not contacted |  |
| 16 | `0xcb8a98250c4471c21011dc979b181D38b5A103c7` | 22 | yes |  | not contacted |  |
| 17 | `0xab448e3E475d1562C027bE9670352119444F4880` | 43 | yes |  | not contacted |  |
| 18 | `0xE08f2c466b1Dbb59ce4858945C39502d5F1b1fC4` | 21 | no wallet |  | not contacted |  |
| 19 | `0xcFeF3fef61AE6dbBaE4B588204e38CBEaDD4c963` | 24 | no wallet |  | not contacted |  |
| 20 | `0x527C32204369806Ba55721Ea200aC7B12c387409` | 25 | no wallet |  | not contacted |  |
| 21 | `0xB2d38d0307564d234C861716955ee2887c4e778e` | 26 | no wallet |  | not contacted |  |

Status values: `not contacted` · `contacted` · `replied` · `said yes` · `SDK installed` · `live` · `declined`

Refresh the census any time:

```bash
for i in $(seq 1 80); do
  cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e "ownerOf(uint256)(address)" $i \
    --rpc-url https://testnet-rpc.monad.xyz
done
```

### The "your agent cannot be paid" opener

More than half of the registered agents have no payout wallet, so nobody can pay them at all. That is
a genuinely useful thing to tell someone, and it opens the conversation without a pitch:

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
- The P256 precompile verifying a real passkey onchain, 158k gas.
- Finding that the score kept counting revoked feedback, and fixing it with a permissionless sweep.
- Why trimming was removed from the scoring: it cannot move a weighted median, so it was pure gas.
- Honest post: a passkey is not proof of personhood, and payment is what actually stops sybils.

## Log

Every contact, newest first. Include the ones that went nowhere.

| Date | Who | Channel | What happened |
|---|---|---|---|
|  |  |  |  |
