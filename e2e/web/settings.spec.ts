import { test, expect } from "@playwright/test";
import { installTauriMock, getInvokeCalls } from "../fixtures/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("editor route mounts under mocked Tauri runtime", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  // No image loaded → EmptyState should appear.
  await expect(page.getByText(/Paste an image|capture from the tray/i)).toBeVisible({ timeout: 10_000 });
});

test("settings view opens via toolbar and invokes IPC", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  // Toolbar exposes an "Open Settings" affordance — click it.
  const settingsBtn = page.getByRole("button", { name: /settings/i }).first();
  await settingsBtn.click({ trial: false });

  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({ timeout: 5_000 });

  // Confirm initial settings load attempted at least one mocked invoke.
  const calls = await getInvokeCalls(page);
  expect(calls.length).toBeGreaterThan(0);
});
