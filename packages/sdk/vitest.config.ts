import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The fork-backed cases hit a real RPC, and anvil pays a cold-cache penalty on the first
    // access to each contract's storage. 5s default is not enough for that first call.
    testTimeout: 30_000,
  },
});
