/**
 * Hand-written ABI slices for the functions the SDK actually calls.
 *
 * Deliberately not generated from Foundry's artifacts: the SDK needs a couple of dozen entries, and
 * a generator would drag the build into the contracts toolchain for no gain. Custom errors are
 * listed so viem can decode a revert into its name before a transaction is ever sent. If a signature here
 * drifts from the deployed contract, the fork test in `test/read.test.ts` fails against a real
 * deployment rather than silently returning junk.
 */

const webAuthnSigTuple = {
  name: "sig",
  type: "tuple",
  components: [
    { name: "authenticatorData", type: "bytes" },
    { name: "clientDataJSON", type: "string" },
    { name: "challengeIndex", type: "uint256" },
    { name: "typeIndex", type: "uint256" },
    { name: "r", type: "uint256" },
    { name: "s", type: "uint256" },
  ],
} as const;

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
  {
    type: "function",
    name: "lastOwnerOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "ground",
    stateMutability: "nonpayable",
    inputs: [
      { name: "receiptId", type: "uint256" },
      { name: "feedbackIndex", type: "uint64" },
      { name: "deadline", type: "uint40" },
      webAuthnSigTuple,
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "groundDigest",
    stateMutability: "view",
    inputs: [
      { name: "receiptId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "feedbackIndex", type: "uint64" },
      { name: "score", type: "uint8" },
      { name: "isDispute", type: "bool" },
      { name: "reviewer", type: "address" },
      { name: "deadline", type: "uint40" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "BadReceipt", inputs: [{ name: "receiptId", type: "uint256" }] },
  { type: "error", name: "NotPayer", inputs: [{ name: "payer", type: "address" }] },
  { type: "error", name: "ExcludedReviewer", inputs: [] },
  { type: "error", name: "BadFeedback", inputs: [{ name: "feedbackIndex", type: "uint64" }] },
  { type: "error", name: "NoPasskey", inputs: [] },
  { type: "error", name: "BadSignature", inputs: [] },
  {
    type: "event",
    name: "Grounded",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "reviewer", type: "address", indexed: true },
      { name: "receiptId", type: "uint256", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "score", type: "uint8", indexed: false },
      { name: "weight", type: "uint8", indexed: false },
      { name: "isDispute", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Swept",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "reviewer", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
    ],
  },
] as const;

export const reviewerRegistryAbi = [
  {
    type: "function",
    name: "bind",
    stateMutability: "nonpayable",
    inputs: [
      { name: "qx", type: "uint256" },
      { name: "qy", type: "uint256" },
      { ...webAuthnSigTuple, name: "proof" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bindDigest",
    stateMutability: "view",
    inputs: [
      { name: "reviewer", type: "address" },
      { name: "qx", type: "uint256" },
      { name: "qy", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "reviewer", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "keyOf",
    stateMutability: "view",
    inputs: [{ name: "reviewer", type: "address" }],
    outputs: [
      { name: "qx", type: "uint256" },
      { name: "qy", type: "uint256" },
    ],
  },
  { type: "error", name: "BadSignature", inputs: [] },
  { type: "error", name: "KeyAlreadyBound", inputs: [{ name: "keyHash", type: "bytes32" }] },
  {
    type: "event",
    name: "ReviewerBound",
    inputs: [
      { name: "reviewer", type: "address", indexed: true },
      { name: "keyHash", type: "bytes32", indexed: true },
      { name: "qx", type: "uint256", indexed: false },
      { name: "qy", type: "uint256", indexed: false },
    ],
  },
] as const;

export const receiptRouterAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  {
    type: "function",
    name: "payWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
      { name: "from", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  {
    type: "function",
    name: "authorizationNonce",
    stateMutability: "pure",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  { type: "error", name: "TokenNotAllowed", inputs: [{ name: "token", type: "address" }] },
  { type: "error", name: "AmountBelowMinimum", inputs: [{ name: "normalised6dp", type: "uint256" }] },
  { type: "error", name: "AmountTooLarge", inputs: [{ name: "value", type: "uint256" }] },
  { type: "error", name: "NoAgentWallet", inputs: [{ name: "agentId", type: "uint256" }] },
  { type: "error", name: "BadSignatureLength", inputs: [{ name: "length", type: "uint256" }] },
  { type: "error", name: "InvalidRecipient", inputs: [{ name: "to", type: "address" }] },
] as const;

/** `ReceiptStatus` in GroundedTypes.sol. */
export const ReceiptStatus = { None: 0, Issued: 1, Consumed: 2 } as const;

export const receiptRegistryAbi = [
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "payer", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint96" },
          { name: "paidAt", type: "uint40" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "ReceiptIssued",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint96", indexed: false },
    ],
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
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "readFeedback",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" },
      { name: "feedbackIndex", type: "uint64" },
    ],
    outputs: [
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "isRevoked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getLastIndex",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" },
    ],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "event",
    name: "FeedbackRevoked",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: true },
    ],
  },
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false },
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

/** FiatToken v2 (Monad testnet USDC): the EIP-712 domain is read from the token, not assumed. */
export const eip3009Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
