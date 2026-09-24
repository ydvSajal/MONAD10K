/** Base for everything this SDK throws, so callers can catch one type. */
export class GroundedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UntrustedAgentError extends GroundedError {
  constructor(
    readonly agentId: bigint,
    readonly reasons: string[],
  ) {
    super(`agent ${agentId} failed the trust policy: ${reasons.join("; ")}`);
  }
}

export class NotDeployedError extends GroundedError {
  constructor(what: string) {
    super(
      `no address known for ${what} on this chain. Grounded is not deployed yet — ` +
        `pass addresses explicitly via config.addresses`,
    );
  }
}

export class AgentNotPayableError extends GroundedError {
  constructor(readonly agentId: bigint) {
    super(
      `agent ${agentId} has no payout wallet: ERC-8004 getAgentWallet returns the zero address, ` +
        `so payments revert. The agent's owner must call setAgentWallet first`,
    );
  }
}

export class NoPasskeyBoundError extends GroundedError {
  constructor(readonly reviewer: string) {
    super(`${reviewer} has no passkey bound in ReviewerRegistry — call bindPasskey() first`);
  }
}

export class ReceiptAlreadyUsedError extends GroundedError {
  constructor(readonly receiptId: bigint) {
    super(`receipt ${receiptId} was already used for a rating`);
  }
}

/** A revert whose custom-error name we managed to decode. */
export class ContractRevertError extends GroundedError {
  constructor(
    readonly errorName: string,
    readonly args?: readonly unknown[],
  ) {
    super(`contract reverted with ${errorName}${args?.length ? `(${args.join(", ")})` : "()"}`);
  }
}

/**
 * The feedback landed in ERC-8004 but `ground` did not. The rating is public and uncounted until
 * `groundFeedback` succeeds with `feedbackIndex`, so the index is carried here rather than lost.
 */
export class GroundFailedError extends GroundedError {
  constructor(
    readonly receiptId: bigint,
    readonly feedbackIndex: bigint,
    readonly feedbackTx: string,
    readonly cause: unknown,
  ) {
    super(
      `feedback ${feedbackIndex} was posted (${feedbackTx}) but grounding receipt ${receiptId} failed: ` +
        `${cause instanceof Error ? cause.message : String(cause)}. Retry with groundFeedback()`,
    );
  }
}

/** A wallet client with an account is needed for anything that sends a transaction. */
/**
 * `withTrust` paid, but the seller still answered 402. The money has moved and the receipt is
 * valid: retry later with `signAccess(receiptId, url, method)` in `X-GROUNDED-RECEIPT`.
 */
export class PaymentNotAcceptedError extends GroundedError {
  constructor(
    readonly receiptId: bigint,
    readonly reason: string,
  ) {
    super(`paid with receipt ${receiptId}, but the seller refused it: ${reason}`);
  }
}

export class NoWalletError extends GroundedError {
  constructor() {
    super("this call sends a transaction: pass a walletClient with an account in the config");
  }
}
