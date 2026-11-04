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
 * Addresses we know without being told. The ERC-8004 registries and USDC were selector-verified
 * against their bytecode; our four come from `deployments/10143.json` (testnet deploy, 4 Oct,
 * block 76889685, redeployed 4 Nov, rpId `grounded.sajal.sbs`).
 */
export const knownAddresses: Record<ChainName, Partial<Addresses>> = {
  "monad-testnet": {
    erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
    erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as Address,
    reviewerRegistry: "0x41B65e7E027FB47cF4DE964F4F82A76Bc6BC5429" as Address,
    receiptRegistry: "0x2E3FD91A619b39210DC1E1Ee94bDa53bD6b1Cf2c" as Address,
    receiptRouter: "0xbE9dbCc36240b358233B2019253178B02D44db54" as Address,
    groundedReputation: "0xCA50d5222566F313D9fb890F2bce144381445356" as Address,
  },
};
