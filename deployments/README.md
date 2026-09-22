# deployments

`<chainId>.json` is written by `contracts/script/Deploy.s.sol`.

These files are **gitignored by default**. A local `anvil --fork-url` run produces a
`10143.json` with the same chain id as the real testnet, and an untracked file like that
silently masquerading as the real deployment is exactly the kind of thing that wastes an
afternoon. When the genuine testnet deploy happens, commit it explicitly:

```bash
forge script script/Deploy.s.sol --rpc-url $NEXT_PUBLIC_RPC_URL \
  --account grounded-deployer --broadcast --verify
git add -f deployments/10143.json
```

Until that line appears in the git history, assume nothing is deployed.
