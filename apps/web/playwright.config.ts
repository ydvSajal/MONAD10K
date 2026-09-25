import { defineConfig } from "@playwright/test";

// Not part of CI: it needs a fork with Grounded deployed and the site running against it (see e2e/playground.spec.ts).
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // The installed Chrome, so no browser download is needed. Set E2E_CHANNEL= to use Playwright's Chromium.
    channel: process.env.E2E_CHANNEL === undefined ? "chrome" : process.env.E2E_CHANNEL || undefined,
    headless: true,
    trace: "retain-on-failure",
  },
});
