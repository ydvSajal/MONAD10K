import { P256 } from "ox";
import { concat, hexToBytes, sha256, stringToHex } from "viem";
import type { Hex } from "viem";

/** Mirrors the Solidity `WebAuthnSig` struct (TRD §2.1). */
export interface WebAuthnSig {
  authenticatorData: Hex;
  clientDataJSON: string;
  challengeIndex: bigint;
  typeIndex: bigint;
  r: bigint;
  s: bigint;
}

export interface PublicKey {
  x: bigint;
  y: bigint;
}

/**
 * Anything that can produce a WebAuthn assertion over a 32-byte challenge. The contracts verify the
 * assertion onchain; they only care that the key matches the one bound in `ReviewerRegistry`.
 */
export interface Authenticator {
  publicKey(): Promise<PublicKey>;
  sign(challenge: Hex): Promise<WebAuthnSig>;
}

/** UP (0x01) | UV (0x04). Both are required by `GroundedWebAuthn`. */
const FLAGS_UP_UV = "0x05";
/** Position of `"challenge"` in the clientDataJSON built below: `{` + `"type":"webauthn.get"` + `,`. */
const CHALLENGE_INDEX = 23n;
const TYPE_INDEX = 1n;

/**
 * A passkey held in memory, for agents and scripts that have no browser (TRD §3.3).
 *
 * The contracts cannot tell this apart from a hardware passkey: it builds the same
 * authenticatorData and clientDataJSON a browser would and signs with the same curve. That is the
 * point for headless buyers, and also why a passkey is proof of a key, not proof of a human.
 */
export class SoftwareAuthenticator implements Authenticator {
  constructor(
    private readonly privateKey: Hex,
    readonly rpId: string = "localhost",
    readonly origin: string = `https://${rpId}`,
  ) {}

  static random(rpId?: string): SoftwareAuthenticator {
    return new SoftwareAuthenticator(P256.randomPrivateKey(), rpId);
  }

  async publicKey(): Promise<PublicKey> {
    const { x, y } = P256.getPublicKey({ privateKey: this.privateKey });
    return { x, y };
  }

  async sign(challenge: Hex): Promise<WebAuthnSig> {
    const authenticatorData = concat([sha256(stringToHex(this.rpId)), FLAGS_UP_UV, "0x00000000"]);
    const clientDataJSON =
      `{"type":"webauthn.get","challenge":"${base64url(challenge)}",` +
      `"origin":"${this.origin}","crossOrigin":false}`;
    const signedHash = sha256(concat([authenticatorData, sha256(stringToHex(clientDataJSON))]));
    // ox signs low-s, which OZ `P256.verify` requires.
    const { r, s } = P256.sign({ payload: signedHash, privateKey: this.privateKey });

    return { authenticatorData, clientDataJSON, challengeIndex: CHALLENGE_INDEX, typeIndex: TYPE_INDEX, r, s };
  }

  /** The private key, for persisting a generated authenticator. Testnet only. */
  exportPrivateKey(): Hex {
    return this.privateKey;
  }
}

function base64url(hex: Hex): string {
  const bytes = hexToBytes(hex);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

