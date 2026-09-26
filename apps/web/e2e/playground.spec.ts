// The playground, end to end, in a real Chrome with a virtual WebAuthn authenticator (user verification on),
// against a fork of Monad testnet with Grounded deployed (RP_ID=localhost) and seeded.
//
//   1. fork + deploy + seed:      pnpm --filter @grounded/seed start
//   2. the drip wallet needs MON and USDC (anvil cheat codes on a fork)
//   3. site:  NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 GROUNDED_ADDRESSES=../../deployments/10143.json \
//             DRIP_PRIVATE_KEY=<funded key> pnpm --filter @grounded/web start
//   4. E2E_AGENT=<a seeded agent id> pnpm --filter @grounded/web e2e
import { expect, test, type Page } from "@playwright/test";

const AGENT = process.env.E2E_AGENT ?? "1931";

async function withVirtualPasskey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

const reviewersOf = async (page: Page) => {
  const res = await page.request.get(`/api/v1/agents/${AGENT}/score`);
  return (await res.json()) as { score: number; reviewers: number; receipts: number };
};

test("a new user funds a wallet, binds a passkey, pays an agent and rates it", async ({ page }) => {
  await withVirtualPasskey(page);
  const startedWith = await reviewersOf(page);

  await page.goto("/playground");
  await page.getByRole("button", { name: "Create test wallet" }).click();
  await expect(page.getByTestId("address")).toHaveText(/^0x[0-9a-fA-F]{40}$/);

  await page.getByRole("button", { name: "Get test funds" }).click();
  await expect(page.getByTestId("balance")).toContainText("USDC");
  await expect(page.getByTestId("balance")).not.toContainText("0 MON");

  await page.getByRole("button", { name: "Create passkey and bind it" }).click();
  await expect(page.getByTestId("passkey-bound")).toBeVisible();

  await page.getByLabel("Agent id").fill(AGENT);
  await page.getByRole("button", { name: /Pay 0\.10 USDC/ }).click();
  await expect(page.getByTestId("receipt")).toContainText("Receipt #");

  await page.getByLabel("Score").fill("88");
  await page.getByRole("button", { name: "Rate agent" }).click();
  await expect(page.getByTestId("after-score")).toBeVisible();
  await expect(page.getByTestId("error")).toHaveCount(0);

  const afterFirst = await reviewersOf(page);
  expect(afterFirst.reviewers).toBe(startedWith.reviewers + 1);

  // Reload: the wallet and the passkey come back from storage, and the restored passkey can still sign.
  await page.reload();
  await expect(page.getByTestId("passkey-bound")).toBeVisible();
  await page.getByLabel("Agent id").fill(AGENT);
  await page.getByRole("button", { name: /Pay 0\.10 USDC/ }).click();
  await expect(page.getByTestId("receipt")).toBeVisible();
  await page.getByLabel("Score").fill("40");
  await page.getByRole("button", { name: "Rate agent" }).click();
  await expect(page.getByTestId("after-score")).toBeVisible();
  await expect(page.getByTestId("error")).toHaveCount(0);

  // The second rating replaced the first: one more reviewer than we started with, not two.
  const afterSecond = await reviewersOf(page);
  expect(afterSecond.reviewers).toBe(startedWith.reviewers + 1);
  expect(afterSecond.receipts).toBe(startedWith.receipts + 2);
});
