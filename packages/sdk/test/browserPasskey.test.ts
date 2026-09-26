import { describe, expect, it } from "vitest";

import { BrowserPasskey, lowS } from "../src/index.js";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

describe("BrowserPasskey", () => {
  it("lowS leaves a low s alone and folds a high one, so either kind of authenticator verifies", () => {
    expect(lowS(5n)).toBe(5n);
    expect(lowS(N / 2n)).toBe(N / 2n); // the boundary is allowed
    expect(lowS(N / 2n + 1n)).toBe(N - (N / 2n + 1n));
    expect(lowS(N - 1n)).toBe(1n);
    expect(lowS(N - 1n) <= N / 2n).toBe(true);
  });

  it("round-trips through JSON, which is how a page remembers its passkey", async () => {
    const saved = { credentialId: "abc_-", qx: "123456789012345678901234567890", qy: "987654321098765432109876543210", rpId: "localhost" };
    const key = BrowserPasskey.restore(saved);
    expect(JSON.parse(JSON.stringify(key))).toEqual(saved);
    expect(await key.publicKey()).toEqual({ x: 123456789012345678901234567890n, y: 987654321098765432109876543210n });
  });
});
