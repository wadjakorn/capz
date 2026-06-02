/**
 * Editor tool palette: select/arrow/rect/text/blur/sticker/pin buttons.
 *
 * Tier-1 scope: assert that each tool button is reachable by accessible name
 * and that clicking toggles the active visual state. Real drawing requires
 * a loaded image (useImage anonymous fetch), which Konva can't satisfy under
 * a headless mock — covered manually in docs/manual-qa.md.
 */
import { test, expect } from "@playwright/test";
import { installTauriMock } from "../fixtures/tauri-mock";

const TOOLS = ["Select", "Arrow", "Rect", "Text", "Blur", "Sticker", "Pin"];

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("tool palette renders all 7 tools by accessible name", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  for (const label of TOOLS) {
    // Some tools may collapse into the OverflowMenu at narrow widths; the test
    // viewport is desktop-sized, so they should all be visible at the top level.
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }
});

test("clicking a tool toggles the active visual class", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  // ToolButton uses a violet gradient (`from-violet-400`) when active.
  const rect = page.getByRole("button", { name: "Rect", exact: true });
  const arrow = page.getByRole("button", { name: "Arrow", exact: true });

  await rect.click();
  await expect(rect).toHaveClass(/from-violet-400/);
  await expect(arrow).not.toHaveClass(/from-violet-400/);

  await arrow.click();
  await expect(arrow).toHaveClass(/from-violet-400/);
  await expect(rect).not.toHaveClass(/from-violet-400/);
});

test("undo/redo are disabled in empty editor", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  // With no annotations + no image, both history actions are disabled.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
});

test("settings cog opens settings view", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // SubViewHeader renders an h1 with the literal "Settings" title regardless
  // of useSettings.ready, so this is the stable assertion.
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
});
