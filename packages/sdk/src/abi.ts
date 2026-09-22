/**
 * Hand-written ABI slices for the functions the SDK actually calls.
 *
 * Deliberately not generated from Foundry's artifacts: the read path needs six functions, and a
 * generator would drag the build into the contracts toolchain for no gain. If a signature here
 * drifts from the deployed contract, the fork test in `test/read.test.ts` fails against a real
 * deployment rather than silently returning junk.
 */

export const groundedReputationAbi = [
  {
    type: "function",
    name: "scoreOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "median", type: "uint8" },
          { name: "reviewers", type: "uint32" },
          { name: "receipts", type: "uint32" },
          { name: "paid", type: "uint128" },
          { name: "weightMass", type: "uint64" },
          { name: "updatedAt", type: "uint40" },
          { name: "ownerChangedAt", type: "uint40" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "meets",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "minScore", type: "uint8" },
      { name: "minReviewers", type: "uint32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "disputeCount",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint32" }],
  },
] as const;

export const erc8004ReputationAbi = [
  {
    type: "function",
    name: "getClients",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

export const erc8004IdentityAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;
