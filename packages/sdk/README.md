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
    groundedReputation: "0xaDDd1f2F876CD253C57177b675905Bdb0061bF82",
    receiptRegistry: "0xa89b76Ea9AcEA12A66Fb23d318219b9119362301",
    receiptRouter: "0xab442c3cbc2997a6218FEA0DD253c3717edfc62e",
    reviewerRegistry: "0xFb38DcB72C222d3943579b4F2c4C91ebcBE4eBa6",
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
