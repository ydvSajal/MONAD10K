# Grounded

Payment-grounded reputation for [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agents on Monad Testnet (10143).

A rating counts only if the reviewer **paid the agent on chain** (one receipt, one rating), **signed it with a passkey** bound to their address, and used a fixed scale and tag. The score is a public contract view anyone can recompute — **payment-grounded, not self-attested**.

> Status: in development for Monad Metropolis. Contracts are unaudited and testnet-only.

## Repo

| Path | What |
|---|---|
| `contracts/` | Foundry. `ReceiptRegistry`, `ReceiptRouter` (live), then `ReviewerRegistry`, `GroundedReputation`, `GroundedGate` |
| `contracts/abi/erc8004/` | ABIs of the deployed ERC-8004 registries, selector-verified against testnet bytecode |
| `grounded-docs/` | PRD, TRD, system architecture, timeline, deployment, integrations |
| `docs/BUILDLOG.md` | Daily log |

## Develop

```bash
cd contracts
forge build
forge test                                    # unit + fuzz + invariant
MONAD_FORK_RPC=https://testnet-rpc.monad.xyz \
  forge test -n monad --match-path "test/fork/*"   # live testnet; -n monad is required
```

`-n monad` selects Foundry's Monad network family — forks fail without it.

## Verified on chain (18 Sep, testnet)

- P256 precompile `0x0100` (EIP-7951) verifies a real signature → passkeys are viable.
- ERC-8004 Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` (both UUPS proxies).
- USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3` — EIP-3009, 6 decimals, EIP-712 domain name `"USDC"` version `"2"`.

## Keys we hold and why

Nothing in the protocol has an owner, admin, pauser or upgrade path. Off chain we hold exactly one key: a **testnet drip wallet** that hands out MON/USDC to demo users. It has no rights in any contract.
