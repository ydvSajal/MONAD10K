# Build log

One line per day. Feeds the pitch and build-in-public posts.

- **17 Sep (Day 1)** — Toolchain up (Foundry/Slither/Aderyn/gitleaks in WSL). A1 answered: ERC-8004 is live on Monad testnet (both registries are UUPS proxies); pulled and selector-verified the ABI against deployed bytecode.
- **18 Sep (Day 2)** — Verified the environment instead of trusting docs: P256 precompile at `0x0100` returns 1 for a real signature, and Monad testnet USDC (`0x534b…43A3`) has EIP-3009 with EIP-712 domain name `"USDC"` v2. Shipped `ReceiptRegistry` + `ReceiptRouter` with 18 tests green, including a fork test that pays live agent 1 with a signed authorization. Found and specced a hole in the design: revoked ERC-8004 feedback kept counting forever — now a permissionless `sweepRevoked`.
- **21 Sep (Day 3)** — Passkey kill switch cleared: a software P256 passkey binds an address through `ReviewerRegistry` and verifies via the live `0x0100` precompile on Monad testnet (`bind` ~158k gas). A Copilot review caught a fund-locking edge case in the router (agent wallet set to the router itself) before it reached `main`. `evm_version` moved to cancun after probing `MCOPY` live.
