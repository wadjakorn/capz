/**
 * Editor tool palette: select/arrow/shapes/text/blur/pen/highlighter/magnify/
 * sticker/pin buttons.
 *
 * Tier-1 scope: assert that each tool button is reachable by accessible name
 * (directly, or via the overflow menu at narrow widths) and that clicking
 * toggles the active visual state. Real drawing requires a loaded image
 * (useImage anonymous fetch), which Konva can't satisfy under a headless mock —
 * covered manually in docs/manual-qa.md.
 */
import { test, expect } from "@playwright/test";
import { installTauriMock } from "../fixtures/tauri-mock";

const TOOLS = [
  "Select",
  "Arrow",
  "Shapes",
  "Text",
  "Blur",
  "Pen",
  "Highlighter",
  "Magnify",
  "Sticker",
  "Pin",
];

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("tool palette exposes every tool by accessible name", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  for (const label of TOOLS) {
    const direct = page.getByRole("button", { name: label, exact: true });
    if (await direct.isVisible().catch(() => false)) {
      await expect(direct).toBeVisible();
      continue;
    }
    // Collapsed into the overflow menu at this width — reachable via "More tools".
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("clicking a tool toggles the active visual class", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  // ToolButton uses a flat accent fill (`bg-[var(--accent)]`) when active.
  const rect = page.getByRole("button", { name: "Shapes", exact: true });
  const arrow = page.getByRole("button", { name: "Arrow", exact: true });

  await rect.click();
  await expect(rect).toHaveClass(/bg-\[var\(--accent\)\]/);
  await expect(arrow).not.toHaveClass(/bg-\[var\(--accent\)\]/);

  await arrow.click();
  await expect(arrow).toHaveClass(/bg-\[var\(--accent\)\]/);
  await expect(rect).not.toHaveClass(/bg-\[var\(--accent\)\]/);
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

test("sidebar shows the Canvas panel when idle, swaps to tool options", async ({
  page,
}) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  // The editor sidebar is tabbed (CP-0047): the Canvas and tool panels are
  // separate containers that are hidden rather than unmounted, so every
  // assertion here is about VISIBILITY. Counting nodes would pass on a hidden
  // panel and prove nothing.
  const canvasPanel = page.locator("#sidebar-panel-canvas");
  const toolPanel = page.locator("#sidebar-panel-tool");

  // Idle (Select tool, nothing selected) → the Canvas panel.
  await expect(canvasPanel.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(
    canvasPanel.getByRole("button", { name: "Open image file" }),
  ).toBeVisible();
  await expect(canvasPanel.getByText("Rulers", { exact: true })).toBeVisible();
  await expect(toolPanel).toBeHidden();

  // Picking a tool with options adds a third tab and opens it.
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(toolPanel).toBeVisible();
  await expect(canvasPanel).toBeHidden();
  await expect(
    page.getByRole("tab", { name: "Pin options" }),
  ).toHaveAttribute("aria-selected", "true");

  // Back to Select → the tool tab goes and the Canvas panel returns.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(canvasPanel.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pin options" })).toHaveCount(0);
});

test("the sidebar is not shown on the settings page", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  await expect(sidebar).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
  // It stays in the DOM so Toolbar's portal targets survive, but it must not
  // be on screen or reachable.
  await expect(sidebar).toBeHidden();
});
