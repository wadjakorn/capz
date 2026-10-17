/**
 * Scrollbars and native controls follow the app theme, not the OS: the
 * `color-scheme` on <body> tracks the `.dark` / `.light` class ThemeManager
 * puts on <html>. The root stays `normal` so transparent windows keep a clear
 * canvas and the landing page keeps its light viewport scrollbar.
 *
 * Tier-1: the React UI under mocked IPC.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { installTauriMock } from "../fixtures/tauri-mock";

const scheme = (page: Page) =>
  page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).colorScheme,
    body: getComputedStyle(document.body).colorScheme,
  }));

async function openAppSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: /^App\b/ })
    .click();
  return page.getByLabel("Appearance");
}

test.describe("editor", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");
  });

  test("default dark theme overrides a light OS", async ({ page }) => {
    await expect.poll(() => scheme(page)).toEqual({ root: "normal", body: "dark" });
  });

  test("switching theme flips the scheme live", async ({ page }) => {
    const select = await openAppSettings(page);
    await select.selectOption("light");
    await expect.poll(() => scheme(page)).toEqual({ root: "normal", body: "light" });
    await select.selectOption("dark");
    await expect.poll(() => scheme(page)).toEqual({ root: "normal", body: "dark" });
  });

  test("system theme tracks the OS appearance", async ({ page }) => {
    const select = await openAppSettings(page);
    await select.selectOption("system");
    await expect.poll(() => scheme(page)).toEqual({ root: "normal", body: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => scheme(page)).toEqual({ root: "normal", body: "dark" });
  });
});

test("landing stays light", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        root: getComputedStyle(document.documentElement).colorScheme,
        sheet: getComputedStyle(document.querySelector(".site-landing")!).colorScheme,
      })),
    )
    .toEqual({ root: "normal", sheet: "light" });
});
