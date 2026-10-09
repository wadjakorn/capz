/**
 * CP-0067: optional "Close the editor after copying with ⌘C / Ctrl+C".
 *
 * Tier-1: the React UI under mocked IPC. The image is loaded the way
 * ocr.spec.ts does it (editor_current_image + a routed asset URL); the window
 * hide is observed as the `plugin:window|hide` invoke.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { installTauriMock, getInvokeCalls, type InvokeHandlers } from "../fixtures/tauri-mock";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function openEditorWithImage(page: Page, handlers: InvokeHandlers = {}) {
  await installTauriMock(page, {
    handlers: { editor_current_image: () => "/tmp/capz-copy-close.png", ...handlers },
  });
  await page.route(/asset\.localhost/, (route) =>
    route.fulfill({ body: TINY_PNG, contentType: "image/png" }),
  );
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Detect text" })).toBeEnabled();
}

async function turnSettingOn(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: /^Saving\b/ })
    .click();
  const row = page.locator('[data-setting-id="after.copyCloses"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText("Close the editor after copying with ⌘C / Ctrl+C");
  const toggle = row.getByRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByTitle("Back to editor").click();
  await expect(page.getByRole("button", { name: "Detect text" })).toBeVisible();
}

const count = async (page: Page, cmd: string) =>
  (await getInvokeCalls(page)).filter((c) => c.cmd === cmd).length;

test("off by default: Ctrl+C copies and the editor stays open", async ({ page }) => {
  await openEditorWithImage(page);
  await page.keyboard.press("Control+c");
  await expect.poll(() => count(page, "plugin:clipboard-manager|write_image")).toBe(1);
  await page.waitForTimeout(300);
  expect(await count(page, "plugin:window|hide")).toBe(0);
});

test("on: Ctrl+C copies once, then hides the editor", async ({ page }) => {
  await openEditorWithImage(page);
  await turnSettingOn(page);
  await page.keyboard.press("Control+c");
  await expect.poll(() => count(page, "plugin:window|hide")).toBe(1);
  // The default close action is "copy" — it must not copy a second time.
  expect(await count(page, "plugin:clipboard-manager|write_image")).toBe(1);
});

test("on: a failed copy keeps the editor open", async ({ page }) => {
  await openEditorWithImage(page, {
    "plugin:clipboard-manager|write_image": () => {
      throw new Error("clipboard busy");
    },
  });
  await turnSettingOn(page);
  await page.keyboard.press("Control+c");
  await expect.poll(() => count(page, "plugin:clipboard-manager|write_image")).toBe(1);
  await page.waitForTimeout(300);
  expect(await count(page, "plugin:window|hide")).toBe(0);
});
