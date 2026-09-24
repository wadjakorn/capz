/**
 * Settings navigation (CP-0053): the labelled sidebar, search, the Advanced
 * fold and the version footer.
 *
 * Tier-1: the React UI under mocked IPC.
 */
import { test, expect } from "@playwright/test";
import { installTauriMock } from "../fixtures/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Capture", level: 2 })).toBeVisible({
    timeout: 10_000,
  });
});

test("sidebar pages are named, not just icons", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  for (const label of ["Capture", "Editor", "After capture", "Library", "App"]) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});

test("switching page swaps the heading and its one-line description", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "After capture", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "After capture", level: 2 })).toBeVisible();
  await expect(page.getByText("Where your screenshot goes.")).toBeVisible();
});

test("everyday rows are visible and the rest sit behind Advanced", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "After capture", exact: true })
    .click();

  await expect(page.locator('[data-setting-id="after.folder"]')).toBeVisible();
  await expect(page.locator('[data-setting-id="after.filename"]')).toHaveCount(0);

  const advanced = page.getByRole("button", { name: /^Advanced/ });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await advanced.click();
  await expect(page.locator('[data-setting-id="after.filename"]')).toBeVisible();
});

test("search jumps to a row, opening Advanced on the way", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search settings" }).fill("filename");
  await page.getByRole("button", { name: /^Filename/ }).click();

  const row = page.locator('[data-setting-id="after.filename"]');
  await expect(row).toBeVisible();
  await expect(page.getByRole("heading", { name: "After capture", level: 2 })).toBeVisible();
  await expect(row.locator("input")).toBeFocused();
});

test("search says so when nothing matches", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search settings" }).fill("kombucha");
  await expect(page.getByText(/No settings match/)).toBeVisible();
});

test("the running version is on screen on every page", async ({ page }) => {
  const footer = page.getByRole("button", { name: /^capz / });
  await expect(footer).toBeVisible();

  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await expect(footer).toBeVisible();
});

test("the version footer opens the update setting", async ({ page }) => {
  await page.getByRole("button", { name: /^capz / }).click();
  await expect(page.getByRole("heading", { name: "App", level: 2 })).toBeVisible();
  await expect(page.locator('[data-setting-id="app.updates"]')).toBeVisible();
});

test("a narrow editor collapses the sidebar to an icon rail", async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 800 });
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(nav).toHaveCSS("width", "56px");
  // The label is still there for screen readers, just not on screen.
  await expect(nav.getByRole("button", { name: "Library", exact: true })).toBeVisible();
});
