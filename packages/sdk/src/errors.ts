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
