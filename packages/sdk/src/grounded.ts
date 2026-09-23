import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  isAddressEqual,
  parseEventLogs,
  parseUnits,
  toHex,
  zeroHash,
} from "viem";
import type { Abi, Account, Address, Hex, PublicClient, TransactionReceipt, WalletClient } from "viem";

import {
  eip3009Abi,
  erc8004IdentityAbi,
  erc8004ReputationAbi,
  groundedReputationAbi,
  receiptRegistryAbi,
  receiptRouterAbi,
  ReceiptStatus,
  reviewerRegistryAbi,
} from "./abi.js";
import type { Authenticator, WebAuthnSig } from "./authenticator.js";
import { accessTypedData, encodeAccess, RECEIPT_HEADER, SCHEME, type Offer, type PaymentRequired } from "./x402.js";
import { chains, knownAddresses } from "./chain.js";
import {
  AgentNotPayableError,
  ContractRevertError,
  GroundedError,
  GroundFailedError,
  NoPasskeyBoundError,
  NotDeployedError,
  NoWalletError,
  ReceiptAlreadyUsedError,
  UntrustedAgentError,
} from "./errors.js";
import {
  agentIdSchema,
  deadlineSchema,
  payArgsSchema,
  payOptionsSchema,
  ratingSchema,
  trustPolicySchema,
  type Addresses,
  type CheckResult,
  type Confidence,
  type GroundedConfig,
  type PayArgs,
  type PayMode,
  type PayOptions,
  type PayResult,
  type RateArgs,
  type RateResult,
  type ScoreResult,
  type TrustPolicy,
} from "./types.js";

/** Below this many live reviewers the score is reported as low confidence (TRD §4). */
const MIN_REVIEWERS_OK = 5;
/** Grounded's fixed rating tag. Anything else is not a score. */
const TAG_QUALITY = "quality";
/** Monad bills the gas limit, not gas used: every write is estimated, then given 15% headroom. */
const GAS_HEADROOM_PCT = 115n;
/** How long an EIP-3009 payment authorization stays valid. */
const AUTHORIZATION_TTL_SEC = 3600n;
const EMPTY_SIG: WebAuthnSig = {
  authenticatorData: "0x",
  clientDataJSON: "",
  challengeIndex: 0n,
  typeIndex: 0n,
  r: 0n,
  s: 0n,
};

export class Grounded {
  readonly publicClient: PublicClient;
  private readonly addresses: Partial<Addresses>;

  constructor(private readonly config: GroundedConfig) {
    const chain = chains[config.chain];
    this.publicClient =
      config.publicClient ??
      (createPublicClient({
        chain,
        transport: http(config.rpcUrl ?? chain.rpcUrls.default.http[0]),
      }) as PublicClient);
    this.addresses = { ...knownAddresses[config.chain], ...config.addresses };
  }

  /** A contract address this client uses. Throws `NotDeployedError` rather than guess. */
  address(name: keyof Addresses): Address {
    const a = this.addresses[name];
    if (!a) throw new NotDeployedError(name);
    return a;
  }

  /**
   * The grounded score, read straight from the contract. Nothing here is recomputed off chain: the
   * median comes from `scoreOf`, so an indexer being down or wrong cannot change the answer.
   */
  async score(agentIdInput: bigint | number | string): Promise<ScoreResult> {
    const agentId = agentIdSchema.parse(agentIdInput);
    const grounded = this.address("groundedReputation");

    const [score, disputes] = await Promise.all([
      this.publicClient.readContract({
        address: grounded,
        abi: groundedReputationAbi,
        functionName: "scoreOf",
        args: [agentId],
      }),
      this.publicClient.readContract({
        address: grounded,
        abi: groundedReputationAbi,
        functionName: "disputeCount",
        args: [agentId],
      }),
    ]);

    const reviewers = Number(score.reviewers);

    return {
      agentId,
      score: Number(score.median),
      rawScore: await this.rawScore(agentId),
      reviewers,
      receipts: Number(score.receipts),
      paid: formatUnits(score.paid, 6),
      confidence: confidenceOf(reviewers),
      updatedAt: toDate(score.updatedAt),
      ownerChangedAt: toDate(score.ownerChangedAt),
      disputes: Number(disputes),
    };
  }

  /**
   * ERC-8004's own average for the same tag: every rating, paid or not. This is the number Grounded
   * exists to contrast with, so the explorer can show them side by side.
   *
   * Returns null instead of throwing, because it is a comparison figure and the registry's
   * `getClients` is unbounded — a popular agent can make this call too large to serve.
   */
  async rawScore(agentId: bigint): Promise<number | null> {
    try {
      const reputation = this.address("erc8004Reputation");
      const clients = await this.publicClient.readContract({
        address: reputation,
        abi: erc8004ReputationAbi,
        functionName: "getClients",
        args: [agentId],
      });
      if (clients.length === 0) return null;

      const [count, summaryValue, decimals] = await this.publicClient.readContract({
        address: reputation,
        abi: erc8004ReputationAbi,
        functionName: "getSummary",
        args: [agentId, clients, TAG_QUALITY, ""],
      });
      if (count === 0n) return null;

      return Number(summaryValue) / 10 ** Number(decimals);
    } catch {
      return null;
    }
  }

  /**
   * Evaluate an agent against a policy. Every failed condition is reported, not just the first, so
   * a caller can tell "too new" apart from "actually bad" — they are very different decisions.
   */
  async check(agentIdInput: bigint | number | string, policy: TrustPolicy): Promise<CheckResult> {
    const p = trustPolicySchema.parse(policy);
    const score = await this.score(agentIdInput);
    const reasons: string[] = [];

    // An unrated agent fails only a policy that asks for reviewers: minReviewers 0 opts in to new agents.
    if (score.reviewers < p.minReviewers) {
      const unrated = score.confidence === "none" ? " (no grounded ratings yet — unrated, which is not the same as bad)" : "";
      reasons.push(`${score.reviewers} reviewers${unrated}, policy wants ${p.minReviewers}`);
    }
    if (score.score < p.minScore) {
      reasons.push(`score ${score.score}, policy wants ${p.minScore}`);
    }
    if (p.ratingsAfterOwnerChange === false && score.ownerChangedAt) {
      reasons.push(
        `agent changed owner at ${score.ownerChangedAt.toISOString()} and the policy does not ` +
          `accept ratings earned before a transfer`,
      );
    }

    return { pass: reasons.length === 0, reasons, score };
  }

  /** `check`, but it throws. For the common "refuse to deal with this agent" path. */
  async assertTrusted(agentIdInput: bigint | number | string, policy: TrustPolicy): Promise<ScoreResult> {
    const result = await this.check(agentIdInput, policy);
    if (!result.pass) throw new UntrustedAgentError(result.score.agentId, result.reasons);
    return result.score;
  }

  /** Where a payment to this agent would land. Zero means the agent cannot be paid at all. */
  async payoutWallet(agentIdInput: bigint | number | string): Promise<Address | null> {
    const agentId = agentIdSchema.parse(agentIdInput);
    const wallet = await this.publicClient.readContract({
      address: this.address("erc8004Identity"),
      abi: erc8004IdentityAbi,
      functionName: "getAgentWallet",
      args: [agentId],
    });
    return wallet === "0x0000000000000000000000000000000000000000" ? null : wallet;
  }

  /** Pay an agent through the router and get back the receipt that later earns one rating. */
  async pay(args: PayArgs): Promise<PayResult> {
    const { agentId, amount, token: tokenArg, mode } = payArgsSchema.parse(args);
    const token = (tokenArg as Address | undefined) ?? this.address("usdc");
    return this.payValue(agentId, token, parseUnits(amount, await this.decimals(token)), mode);
  }

  /**
   * A `fetch` that answers a `grounded-router` 402 by itself: check the agent against `policy`,
   * pay through the router, and retry with a signed receipt. An agent that fails the policy throws
   * `UntrustedAgentError` and is paid nothing. Any other response, including a 402 in some other
   * scheme, is returned untouched.
   */
  withTrust(f: typeof fetch, options: TrustPolicy & PayOptions): typeof fetch {
    const { maxAmount, mode } = payOptionsSchema.parse(options);
    trustPolicySchema.parse(options); // fail at wrap time, not on the first 402
    return async (input, init) => {
      // A Request body can be read once; keep a copy for the retry.
      const retry = input instanceof Request ? input.clone() : input;
      const res = await f(input, init);
      if (res.status !== 402) return res;
      const offer = await this.offerIn(res.clone());
      if (!offer) return res;

      const agentId = BigInt(offer.extra.agentId);
      const amount = BigInt(offer.amount);
      await this.assertTrusted(agentId, options);
      const cap = parseUnits(maxAmount, await this.decimals(offer.asset));
      if (amount > cap) {
        throw new GroundedError(`agent ${agentId} asks ${amount} base units, over the ${maxAmount} cap`);
      }
      const { receiptId } = await this.payValue(agentId, offer.asset, amount, mode);

      // Not `new Request(input)`: the first fetch may have used its body.
      const url = input instanceof Request ? input.url : new URL(String(input), globalThis.location?.href).href;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const headers = new Headers(init?.headers ?? (retry instanceof Request ? retry.headers : undefined));
      headers.set(RECEIPT_HEADER, await this.signAccess(receiptId, url, method));
      return f(retry, { ...init, headers });
    };
  }

  /**
   * The Grounded offer in a 402, or null if it has none. An offer that names our scheme but not our
   * router or chain is refused outright: paying it would not produce a receipt we can rate with.
   */
  private async offerIn(res: Response): Promise<Offer | null> {
    const body = (await res.json().catch(() => null)) as PaymentRequired | null;
    const offer = body?.accepts?.find((a) => a.scheme === SCHEME);
    if (!offer) return null;
    const chainId = await this.publicClient.getChainId();
    const token = this.address("usdc");
    if (
      offer.network !== `eip155:${chainId}` ||
      !isAddressEqual(offer.payTo, this.address("receiptRouter")) ||
      !isAddressEqual(offer.extra.receiptRegistry, this.address("receiptRegistry")) ||
      !isAddressEqual(offer.asset, token)
    ) {
      throw new GroundedError(`402 offer is not for this Grounded deployment: ${JSON.stringify(offer)}`);
    }
    return offer;
  }

  /** The `X-GROUNDED-RECEIPT` value: proof that the payer of `receiptId` is the one asking. */
  async signAccess(receiptId: bigint, url: string, method: string): Promise<string> {
    const { wallet, account } = this.signer();
    const iat = Math.floor(Date.now() / 1000);
    const access = { receiptId, url, method: method.toUpperCase(), iat };
    const typed = accessTypedData(access, await this.publicClient.getChainId(), this.address("receiptRegistry"));
    const sig = await wallet.signTypedData({ account, ...typed });
    return encodeAccess({ ...access, payer: account.address, sig });
  }

  private decimals(token: Address): Promise<number> {
    return this.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
  }

  private async payValue(agentId: bigint, token: Address, value: bigint, mode: PayMode): Promise<PayResult> {
    const router = this.address("receiptRouter");
    const { wallet, account } = this.signer();

    // The router reverts NoAgentWallet too, but only after an approve would have been spent.
    const to = await this.payoutWallet(agentId);
    if (!to) throw new AgentNotPayableError(agentId);
    if (isAddressEqual(to, router)) {
      throw new GroundedError(`agent ${agentId}'s payout wallet is the router itself; the router refuses to pay it`);
    }

    let receipt: TransactionReceipt;
    if (mode === "authorization") {
      const [name, version, block, chainId] = await Promise.all([
        this.publicClient.readContract({ address: token, abi: eip3009Abi, functionName: "name" }),
        this.publicClient.readContract({ address: token, abi: eip3009Abi, functionName: "version" }),
        this.publicClient.getBlock(),
        this.publicClient.getChainId(),
      ]);
      const validBefore = block.timestamp + AUTHORIZATION_TTL_SEC;
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const signature = await wallet.signTypedData({
        account,
        domain: { name, version, chainId, verifyingContract: token },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: { from: account.address, to, value, validAfter: 0n, validBefore, nonce },
      });
      receipt = await this.send(router, receiptRouterAbi, "payWithAuthorization", [
        agentId,
        token,
        account.address,
        value,
        0n,
        validBefore,
        nonce,
        signature,
      ]);
    } else {
      const allowance = await this.publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, router],
      });
      if (allowance < value) await this.send(token, erc20Abi, "approve", [router, value]);
      receipt = await this.send(router, receiptRouterAbi, "pay", [agentId, token, value]);
    }

    const registry = this.address("receiptRegistry");
    const issued = parseEventLogs({
      abi: receiptRegistryAbi,
      eventName: "ReceiptIssued",
      logs: receipt.logs,
    }).find((l) => isAddressEqual(l.address, registry));
    if (!issued) throw new GroundedError(`no ReceiptIssued event in ${receipt.transactionHash}`);
    return { receiptId: issued.args.id, txHash: receipt.transactionHash };
  }

  /** Bind (or rotate to) this authenticator's passkey for the connected wallet. */
  async bindPasskey(authenticator: Authenticator): Promise<Hex> {
    const registry = this.address("reviewerRegistry");
    const { account } = this.signer();
    const [{ x, y }, nonce] = await Promise.all([
      authenticator.publicKey(),
      this.publicClient.readContract({
        address: registry,
        abi: reviewerRegistryAbi,
        functionName: "nonces",
        args: [account.address],
      }),
    ]);
    // The contract computes its own EIP-712 digest; asking it avoids a second implementation drifting.
    const digest = await this.publicClient.readContract({
      address: registry,
      abi: reviewerRegistryAbi,
      functionName: "bindDigest",
      args: [account.address, x, y, nonce],
    });
    const proof = await authenticator.sign(digest);
    const receipt = await this.send(registry, reviewerRegistryAbi, "bind", [x, y, proof]);
    return receipt.transactionHash;
  }

  /**
   * Rate an agent you paid: post the ERC-8004 feedback, then ground it with the receipt.
   *
   * Everything `ground` would reject that can be checked in advance is checked before the feedback
   * goes out, because feedback is public and permanent while an ungrounded one counts for nothing.
   * If `ground` still fails, `GroundFailedError` carries the feedback index for `groundFeedback`.
   */
  async rate(args: RateArgs): Promise<RateResult> {
    const { receiptId, score, tag, deadlineSec } = ratingSchema.parse(args);
    const { authenticator } = args;
    const { account } = this.signer();

    const r = await this.receipt(receiptId);
    if (r.status === ReceiptStatus.Consumed) throw new ReceiptAlreadyUsedError(receiptId);
    if (r.status !== ReceiptStatus.Issued) throw new GroundedError(`receipt ${receiptId} does not exist`);
    if (!isAddressEqual(r.payer, account.address)) {
      throw new GroundedError(`receipt ${receiptId} was paid by ${r.payer}; only the payer can rate with it`);
    }
    await this.requirePasskey(account.address, authenticator);
    await this.preflightGround(receiptId, r.agentId, account.address);

    const reputation = this.address("erc8004Reputation");
    const feedback = await this.send(reputation, erc8004ReputationAbi, "giveFeedback", [
      r.agentId,
      BigInt(score),
      0,
      tag,
      "",
      "",
      "",
      zeroHash,
    ]);
    // Read the index the registry assigned; guessing it races any other feedback from this wallet.
    const posted = parseEventLogs({
      abi: erc8004ReputationAbi,
      eventName: "NewFeedback",
      logs: feedback.logs,
      args: { agentId: r.agentId, clientAddress: account.address },
    }).find((l) => isAddressEqual(l.address, reputation));
    if (!posted) throw new GroundedError(`no NewFeedback event in ${feedback.transactionHash}`);
    const { feedbackIndex } = posted.args;

    try {
      const groundTx = await this.groundFeedback({ receiptId, feedbackIndex, authenticator, deadlineSec });
      return { feedbackTx: feedback.transactionHash, groundTx, feedbackIndex };
    } catch (e) {
      throw new GroundFailedError(receiptId, feedbackIndex, feedback.transactionHash, e);
    }
  }

  /** Ground feedback that already exists in ERC-8004. `rate` calls this; use it directly to retry. */
  async groundFeedback(args: {
    receiptId: bigint;
    feedbackIndex: bigint;
    authenticator: Authenticator;
    deadlineSec?: number;
  }): Promise<Hex> {
    const { receiptId, feedbackIndex, authenticator } = args;
    const { deadlineSec } = deadlineSchema.parse(args);
    const grounded = this.address("groundedReputation");
    const { account } = this.signer();

    const r = await this.receipt(receiptId);
    const [value, , tag1] = await this.publicClient.readContract({
      address: this.address("erc8004Reputation"),
      abi: erc8004ReputationAbi,
      functionName: "readFeedback",
      args: [r.agentId, account.address, feedbackIndex],
    });
    // Sign exactly what Erc8004Adapter will read back: a dispute is recorded with score 0.
    const isDispute = tag1 === "dispute";
    const score = isDispute ? 0 : Number(value);
    // Chain time, not the local clock: they differ on a fork, and the contract only knows the former.
    const deadline = Number((await this.publicClient.getBlock()).timestamp) + deadlineSec;

    const digest = await this.publicClient.readContract({
      address: grounded,
      abi: groundedReputationAbi,
      functionName: "groundDigest",
      args: [receiptId, r.agentId, feedbackIndex, score, isDispute, account.address, deadline],
    });
    const sig = await authenticator.sign(digest);
    const receipt = await this.send(grounded, groundedReputationAbi, "ground", [
      receiptId,
      feedbackIndex,
      deadline,
      sig,
    ]);
    return receipt.transactionHash;
  }

  private signer(): { wallet: WalletClient; account: Account } {
    const wallet = this.config.walletClient;
    if (!wallet?.account) throw new NoWalletError();
    return { wallet, account: wallet.account };
  }

  private receipt(receiptId: bigint) {
    return this.publicClient.readContract({
      address: this.address("receiptRegistry"),
      abi: receiptRegistryAbi,
      functionName: "get",
      args: [receiptId],
    });
  }

  private async requirePasskey(reviewer: Address, authenticator: Authenticator): Promise<void> {
    const [[qx, qy], { x, y }] = await Promise.all([
      this.publicClient.readContract({
        address: this.address("reviewerRegistry"),
        abi: reviewerRegistryAbi,
        functionName: "keyOf",
        args: [reviewer],
      }),
      authenticator.publicKey(),
    ]);
    if (qx === 0n && qy === 0n) throw new NoPasskeyBoundError(reviewer);
    if (qx !== x || qy !== y) {
      throw new GroundedError(`${reviewer} has a different passkey bound than this authenticator`);
    }
  }

  /**
   * Run `ground` as an eth_call before any feedback is posted. `ground` checks deadline, receipt,
   * payer and exclusions before it reads the feedback (TRD §2.5), so with no feedback yet the only
   * acceptable outcome is failing at that read. Anything else, including a revert from a registry
   * underneath, would sink the real call too, so it stops us before the feedback exists.
   */
  private async preflightGround(receiptId: bigint, agentId: bigint, reviewer: Address): Promise<void> {
    const [block, last] = await Promise.all([
      this.publicClient.getBlock(),
      this.publicClient.readContract({
        address: this.address("erc8004Reputation"),
        abi: erc8004ReputationAbi,
        functionName: "getLastIndex",
        args: [agentId, reviewer],
      }),
    ]);
    try {
      await this.publicClient.simulateContract({
        address: this.address("groundedReputation"),
        abi: groundedReputationAbi,
        functionName: "ground",
        // The index the next feedback will get, so the run reaches the feedback read and stops there.
        args: [receiptId, last + 1n, Number(block.timestamp) + 60, EMPTY_SIG],
        account: reviewer,
      });
    } catch (e) {
      if (!isFeedbackNotYetPosted(revertOf(e)?.data)) throw decodeRevert(e);
    }
  }

  /** Estimate, add headroom, send, wait. Reverts caught at estimation come back decoded. */
  private async send(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<TransactionReceipt> {
    const { wallet, account } = this.signer();
    // viem cannot type a call whose abi and function name are chosen at runtime; callers pass
    // literal ABIs from abi.ts, and a mismatch still fails at encoding, before anything is sent.
    const call = { address, abi, functionName, args, account } as Parameters<
      PublicClient["estimateContractGas"]
    >[0];
    let gas: bigint;
    try {
      gas = await this.publicClient.estimateContractGas(call);
    } catch (e) {
      throw decodeRevert(e);
    }
    const hash = await wallet.writeContract({
      ...call,
      gas: (gas * GAS_HEADROOM_PCT) / 100n,
      chain: wallet.chain ?? this.publicClient.chain,
    } as Parameters<WalletClient["writeContract"]>[0]);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new GroundedError(`transaction ${hash} reverted onchain`);
    return receipt;
  }
}

function revertOf(e: unknown): ContractFunctionRevertedError | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const found = e.walk((x) => x instanceof ContractFunctionRevertedError);
  return found instanceof ContractFunctionRevertedError ? found : undefined;
}

/**
 * How the preflight's feedback read may fail when every earlier check passed. The live registry
 * reverts on an index that does not exist yet rather than returning an empty entry, so that exact
 * reason is accepted too. Matching is by exact string on purpose: if a registry upgrade changes
 * it, `rate` refuses to post instead of guessing, which is the safe direction.
 */
function isFeedbackNotYetPosted(data: ContractFunctionRevertedError["data"]): boolean {
  if (!data) return false;
  if (data.errorName === "BadFeedback") return true;
  return data.errorName === "Error" && data.args?.[0] === "index out of bounds";
}

/** Turn a viem revert into the SDK's typed error when the custom error is one we know. */
function decodeRevert(e: unknown): unknown {
  const data = revertOf(e)?.data;
  if (!data) return e;
  if (data.errorName === "NoAgentWallet") return new AgentNotPayableError(data.args?.[0] as bigint);
  return new ContractRevertError(data.errorName, data.args);
}

function confidenceOf(reviewers: number): Confidence {
  if (reviewers === 0) return "none";
  return reviewers < MIN_REVIEWERS_OK ? "low" : "ok";
}

function toDate(timestamp: bigint | number): Date | null {
  const t = Number(timestamp);
  return t === 0 ? null : new Date(t * 1000);
}
