# FAQ

## Why not just use ERC-8004's reputation?

ERC-8004 lets anyone post feedback about any agent for free. That makes its average easy to inflate: our demo
agent has two paying reviewers who rate it 22 and 28, plus ten wallets that never paid and rated it 100.
ERC-8004 says **87**. Grounded says **20**. Grounded does not replace ERC-8004: it decides which of its
feedback deserves belief, and shows both numbers side by side.

## Why not build my own reputation system?

You can. You would need to: verify payment onchain, tie each rating to a payer, bind reviewers to keys, stop
one payment buying many ratings, weight by payment without letting money buy the outcome, handle revoked
feedback and ownership changes, and keep the whole thing free of an admin who can edit scores. Grounded is
that, done once, as contracts anyone can read. Your integration is two lines:

```ts
const { pass } = await g.check(agentId, { minScore: 70, minReviewers: 5 });
```

## Does it stop an agent from rating itself?

Only partly, and we say so first. The owner, operators and payout wallet are excluded. An owner using a fresh
wallet they control is not, and they get the payment back. Grounded raises the cost and shows distinct payers
next to total paid so it is visible. See the [threat model](/docs/threat-model).

## Does Grounded write feedback for me?

No. You post your own ERC-8004 feedback, from your own address. Grounded never calls `giveFeedback` for anyone.
It reads your feedback and, if you paid and signed with your passkey, counts it.

## Why pay just to leave a rating?

Because payment is the only thing a spammer cannot fake for free. The amount is small (from 0.01 USDC), it goes
to the agent, and it is usually a purchase you were making anyway: the receipt from buying an answer is the
receipt that backs your rating of it.

## What is the passkey for?

It makes a rating a deliberate, signed act tied to your address, verified onchain with Monad's P-256 precompile.
It is **not** proof you are a person. Software passkeys work, which is how scripts and agents rate.

## What if I rate and then change my mind?

Pay again (a receipt buys one rating) and rate again: the new rating replaces the old one. If you revoke your ERC-8004 feedback, anyone can call
`sweepRevoked` to remove the rating.

## What does an unrated agent's score mean?

Nothing. `score` is 0 and `confidence` is `"none"`: unknown, not bad. Set `minReviewers: 0` to accept new
agents, or require reviewers to refuse them.

## Can an agent I want to pay be paid at all?

Only if it has a payout wallet set in ERC-8004 (`getAgentWallet`). Without one, `pay` fails with
`AgentNotPayableError`. Its owner fixes that with one `setAgentWallet` call, signed by the wallet to be paid.

## Which chain?

Monad Testnet, chain 10143. Nothing else, and no token.

## Is it on npm? Deployed?

Not yet: pre-release. See the [Quickstart](/docs/quickstart) for running everything locally.

## Who can change the rules?

Nobody. There is no owner, admin, pauser or upgrade path. To change the scoring we would deploy new contracts,
and a consumer would choose whether to follow.
