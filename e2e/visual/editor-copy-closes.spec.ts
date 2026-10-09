import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { installTauriMock, getInvokeCalls } from "../fixtures/tauri-mock";
import { drawRect, snap, stageBox } from "./helpers";

// L4 visual check for CP-0067: with "Close the editor after copying with
// ⌘C / Ctrl+C" on, Ctrl+C with an element selected copies the element and the
// editor stays; with nothing selected it copies the image and hides the window.
// Runs the desktop editor (/editor) under mocked IPC, so the hide is visible
// as the `plugin:window|hide` invoke.

const ICON = readFileSync(path.join(__dirname, "..", "..", "src-tauri", "icons", "icon.png"));

const count = async (page: Page, cmd: string) =>
  (await getInvokeCalls(page)).filter((c) => c.cmd === cmd).length;

test("Ctrl+C closes after a whole-image copy, not after an element copy", async ({ page }) => {
  await installTauriMock(page, {
    handlers: { editor_current_image: () => "/tmp/capz-copy-close.png" },
  });
  await page.route(/asset\.localhost/, (route) =>
    route.fulfill({ body: ICON, contentType: "image/png" }),
  );
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Detect text" })).toBeEnabled();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: /^Saving\b/ })
    .click();
  const toggle = page.locator('[data-setting-id="after.copyCloses"]').getByRole("switch");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await snap(page, "setting-on");
  await page.getByTitle("Back to editor").click();

  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await stageBox(page);
  await page.mouse.click(box.x + 140, box.y + 120);
  await snap(page, "element-selected");

  await page.keyboard.press("Control+c");
  await expect(page.getByText("Element copied")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await count(page, "plugin:window|hide")).toBe(0);
  await snap(page, "after-element-copy-still-open");

  await page.keyboard.press("Escape"); // deselect
  await page.keyboard.press("Control+c");
  await expect.poll(() => count(page, "plugin:window|hide")).toBe(1);
  await snap(page, "after-image-copy-hidden");
});
