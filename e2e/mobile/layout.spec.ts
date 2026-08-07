import { test, expect } from "@playwright/test";

test("the tool-options panel is off-canvas until opened on a phone", async ({
  page,
}) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  const panel = page.locator("#tool-options-slot");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: /open tool options/i }).click();
  await expect(panel).toBeVisible();
});

test("the canvas area gets the full width on a phone", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  // #canvas-area is the actual canvas-holding element (page.tsx's inner
  // `relative min-w-0 flex-1` div), not `main` — `main` is the flex
  // container and is always full-width regardless of what its children do,
  // so asserting on it would pass even with the old always-docked 240px
  // sidebar present.
  const canvasArea = page.locator("#canvas-area");
  const box = (await canvasArea.boundingBox())!;
  const viewport = page.viewportSize()!;
  // Within a pixel of the full width — no 240px sidebar stealing space.
  expect(box.width).toBeGreaterThan(viewport.width - 2);
});
