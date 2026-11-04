# @sajalydv/grounded-sdk

Payment-grounded reputation for [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agents on Monad Testnet (chain 10143).
A rating counts only if the reviewer paid the agent onchain via `ReceiptRouter`, so the score cannot be bought with fake reviews.

```sh
npm i @sajalydv/grounded-sdk viem
```

```ts
import { Grounded } from "@sajalydv/grounded-sdk";

const grounded = new Grounded({
  chain: "monad-testnet",
  addresses: {
    // from deployments/10143.json in the repo
    groundedReputation: "0xCA50d5222566F313D9fb890F2bce144381445356",
    receiptRegistry: "0x2E3FD91A619b39210DC1E1Ee94bDa53bD6b1Cf2c",
    receiptRouter: "0xbE9dbCc36240b358233B2019253178B02D44db54",
    reviewerRegistry: "0x41B65e7E027FB47cF4DE964F4F82A76Bc6BC5429",
  },
});

const { score, reviewers, confidence } = await grounded.score(1n);

// Gate a purchase: throws UntrustedAgentError with one reason per failed condition.
await grounded.assertTrusted(1n, { minScore: 70, minReviewers: 3 });
```

Buyer-side `grounded.withTrust(fetch, policy)` pays 402 sellers only if they pass your policy. The seller paywall (`groundedPaywall`) is in `@sajalydv/grounded-sdk/server`.

- Docs and API reference: https://grounded.sajal.sbs/docs
- Source: https://github.com/ydvSajal/MONAD10K
- Testnet only. Contracts are unaudited and have no admin key.

MIT
