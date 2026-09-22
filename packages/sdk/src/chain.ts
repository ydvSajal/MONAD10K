import { defineChain } from "viem";
import type { Address } from "viem";
import type { Addresses, ChainName } from "./types.js";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const chains: Record<ChainName, typeof monadTestnet> = {
  "monad-testnet": monadTestnet,
};

/**
 * Addresses we know without being told. The ERC-8004 registries and USDC are already deployed and
 * were selector-verified against their bytecode; our own four are not deployed yet, so they stay
 * absent and the SDK throws `NotDeployedError` rather than pointing at a plausible-looking zero
 * address. Fill these in from `deployments/10143.json` once the real deploy lands.
 */
export const knownAddresses: Record<ChainName, Partial<Addresses>> = {
  "monad-testnet": {
    erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
    erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as Address,
  },
};
