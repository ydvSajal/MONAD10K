import { WebAuthnP256 } from "ox";
import type { Hex } from "viem";

import type { Authenticator, PublicKey, WebAuthnSig } from "./authenticator.js";

/** Order of the P-256 curve. `GroundedWebAuthn` rejects `s` above half of it. */
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** Hardware authenticators return either `s` or `n - s`; the contract accepts only the low one. */
export function lowS(s: bigint): bigint {
  return s > P256_N / 2n ? P256_N - s : s;
}

/** JSON-safe, so a page can keep its passkey in localStorage between visits. The private key never leaves the device. */
export interface SavedPasskey {
  credentialId: string;
  qx: string;
  qy: string;
  rpId: string;
}

/**
 * A real WebAuthn passkey in the browser (Touch ID, Windows Hello, a phone, a security key), through `ox`.
 * User verification is required: the contracts refuse an assertion without it. Only usable in a browser
 * on a secure origin whose host matches `rpId`; importing this module elsewhere is harmless.
 */
export class BrowserPasskey implements Authenticator {
  private constructor(
    readonly credentialId: string,
    private readonly key: PublicKey,
    readonly rpId: string,
  ) {}

  /** Prompts the user to create a passkey scoped to `rpId`. */
  static async create(opts: { rpId: string; name: string }): Promise<BrowserPasskey> {
    const credential = await WebAuthnP256.createCredential({
      name: opts.name,
      rp: { id: opts.rpId, name: "Grounded" },
    });
    return new BrowserPasskey(credential.id, { x: credential.publicKey.x, y: credential.publicKey.y }, opts.rpId);
  }

  static restore(saved: SavedPasskey): BrowserPasskey {
    return new BrowserPasskey(saved.credentialId, { x: BigInt(saved.qx), y: BigInt(saved.qy) }, saved.rpId);
  }

  toJSON(): SavedPasskey {
    return { credentialId: this.credentialId, qx: this.key.x.toString(), qy: this.key.y.toString(), rpId: this.rpId };
  }

  async publicKey(): Promise<PublicKey> {
    return this.key;
  }

  async sign(challenge: Hex): Promise<WebAuthnSig> {
    const { metadata, signature } = await WebAuthnP256.sign({
      challenge,
      credentialId: this.credentialId,
      rpId: this.rpId,
    });
    const { challengeIndex, typeIndex } = metadata;
    if (challengeIndex === undefined || typeIndex === undefined) {
      throw new Error("the authenticator's clientDataJSON has no challenge or type field");
    }
    return {
      authenticatorData: metadata.authenticatorData,
      clientDataJSON: metadata.clientDataJSON,
      challengeIndex: BigInt(challengeIndex),
      typeIndex: BigInt(typeIndex),
      r: signature.r,
      s: lowS(signature.s),
    };
  }
}
