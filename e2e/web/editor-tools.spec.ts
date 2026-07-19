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

test("sidebar shows global tools when idle, swaps to tool options", async ({
  page,
}) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  const slot = page.locator("#tool-options-slot");
  // Idle (Select tool, nothing selected) → global/workspace tools (CP-0044).
  await expect(slot.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(slot.getByRole("button", { name: "Open image file" })).toBeVisible();
  await expect(slot.getByText("Rulers", { exact: true })).toBeVisible();

  // Picking a tool with options hands the slot to that tool's panel.
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(slot.getByText("Workspace", { exact: true })).toHaveCount(0);

  // Back to Select → global tools return.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(slot.getByText("Workspace", { exact: true })).toBeVisible();
});
