import { describe, expect, it } from "vitest";
import { WebAuthnP256 } from "ox";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { Grounded } from "../src/grounded.js";
import { SoftwareAuthenticator } from "../src/authenticator.js";
import { NoWalletError } from "../src/errors.js";
import { monadTestnet } from "../src/chain.js";

const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const CHALLENGE = "0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

describe("SoftwareAuthenticator", () => {
  it("produces an assertion an independent WebAuthn verifier accepts", async () => {
    const auth = SoftwareAuthenticator.random("grounded.sajal.sbs");
    const sig = await auth.sign(CHALLENGE);
    const publicKey = { prefix: 4, ...(await auth.publicKey()) } as const;

    const ok = WebAuthnP256.verify({
      challenge: CHALLENGE,
      publicKey,
      rpId: "grounded.sajal.sbs",
      signature: { r: sig.r, s: sig.s },
      metadata: {
        authenticatorData: sig.authenticatorData,
        clientDataJSON: sig.clientDataJSON,
        challengeIndex: Number(sig.challengeIndex),
        typeIndex: Number(sig.typeIndex),
        userVerificationRequired: true,
      },
    });
    expect(ok).toBe(true);
  });

  it("puts type and challenge exactly where the indices say, and signs low-s", async () => {
    const sig = await SoftwareAuthenticator.random().sign(CHALLENGE);
    const json = sig.clientDataJSON;

    expect(json.slice(Number(sig.typeIndex)).startsWith('"type":"webauthn.get"')).toBe(true);
    expect(json.slice(Number(sig.challengeIndex)).startsWith('"challenge":"')).toBe(true);
    expect(sig.s <= P256_N / 2n).toBe(true);
    // rpIdHash (32) + flags (1, UP|UV) + counter (4)
    expect(sig.authenticatorData.length).toBe(2 + 37 * 2);
    expect(sig.authenticatorData.slice(66, 68)).toBe("05");
  });

  it("round-trips its key so a headless buyer keeps one identity across restarts", async () => {
    const a = SoftwareAuthenticator.random();
    const b = new SoftwareAuthenticator(a.exportPrivateKey());
    expect(await b.publicKey()).toEqual(await a.publicKey());
  });
});

describe("write path (no network)", () => {
  const wallet = createWalletClient({
    chain: monadTestnet,
    transport: http("http://127.0.0.1:1"),
    account: privateKeyToAccount(generatePrivateKey()),
  });
  const g = new Grounded({ chain: "monad-testnet", walletClient: wallet });
  const auth = SoftwareAuthenticator.random();

  it("refuses to send without a wallet", async () => {
    const readOnly = new Grounded({ chain: "monad-testnet" });
    await expect(readOnly.rate({ receiptId: 1n, score: 80, authenticator: auth })).rejects.toBeInstanceOf(
      NoWalletError,
    );
  });

  it("validates ratings at the boundary", async () => {
    await expect(g.rate({ receiptId: 1n, score: 101, authenticator: auth })).rejects.toThrow();
    await expect(g.rate({ receiptId: 1n, score: 79.5, authenticator: auth })).rejects.toThrow();
    await expect(g.rate({ receiptId: 0n, score: 80, authenticator: auth })).rejects.toThrow();
    // Must fail before any feedback is posted, not when the uint40 deadline is encoded afterwards.
    await expect(g.rate({ receiptId: 1n, score: 80, authenticator: auth, deadlineSec: 2 ** 41 })).rejects.toThrow();
  });

  it("validates payments at the boundary", async () => {
    await expect(g.pay({ agentId: 1n, amount: "0.001" })).rejects.toThrow(/at least 0.01/);
    await expect(g.pay({ agentId: 1n, amount: "1e3" })).rejects.toThrow(/plain decimal/);
    await expect(g.pay({ agentId: 1n, amount: "1", mode: "wire" as never })).rejects.toThrow();
  });
});
