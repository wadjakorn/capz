import { test, expect } from "../fixtures/test";
import {
  LEFT,
  ocrLayer,
  ocrScopeBox,
  selectedText,
  setupTwoColOcr,
  toScreen,
} from "../fixtures/ocr-two-col";
import { snap } from "./helpers";

// L4 visual check for CP-0099: in OCR mode, dragging a box keeps only the
// text inside it, dims the rest of the image and pre-selects the kept text.
// Runs the desktop editor (/editor) under mocked IPC — /paste has no OCR.

test("drag a box in OCR mode to keep only that area's text", async ({ page }) => {
  await setupTwoColOcr(page);
  await snap(page, "whole-image-text");

  const a = await toScreen(page, LEFT.from);
  const mid = await toScreen(page, { x: 200, y: 160 });
  const b = await toScreen(page, LEFT.to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 5 });
  await expect(page.locator("[data-ocr-scope-draft]")).toBeVisible();
  await snap(page, "dragging");

  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(ocrScopeBox(page)).toBeVisible();
  await expect(ocrLayer(page)).not.toContainText("Right one");
  expect(await selectedText(page)).toBe("Left one\nLeft two");
  await snap(page, "scoped-and-selected");

  await page.keyboard.press("Escape");
  await expect(ocrScopeBox(page)).toHaveCount(0);
  await expect(ocrLayer(page)).toContainText("Right one");
  await snap(page, "esc-whole-image-again");
});
