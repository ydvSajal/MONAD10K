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
 * block 68082112, rpId `grounded.sajal.sbs`).
 */
export const knownAddresses: Record<ChainName, Partial<Addresses>> = {
  "monad-testnet": {
    erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
    erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as Address,
    reviewerRegistry: "0xFb38DcB72C222d3943579b4F2c4C91ebcBE4eBa6" as Address,
    receiptRegistry: "0xa89b76Ea9AcEA12A66Fb23d318219b9119362301" as Address,
    receiptRouter: "0xab442c3cbc2997a6218FEA0DD253c3717edfc62e" as Address,
    groundedReputation: "0xaDDd1f2F876CD253C57177b675905Bdb0061bF82" as Address,
  },
};
