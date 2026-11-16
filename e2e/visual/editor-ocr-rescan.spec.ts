import { test, expect } from "../fixtures/test";
import { ocrLayer, selectedText, setupTwoColOcr, toScreen } from "../fixtures/ocr-two-col";
import { snap } from "./helpers";

// L4 visual check for CP-0100: with OpenThai, a scope box is re-scanned. The
// box shows a spinner, then the line the whole-image scan missed ("Left
// three") joins the scope and the selection. /editor under mocked IPC.

test("an OpenThai scope box is re-scanned and gains the missed line", async ({ page }) => {
  await setupTwoColOcr(page, { rescan: true });
  await snap(page, "whole-image-missing-left-three");

  const a = await toScreen(page, { x: 20, y: 80 });
  const b = await toScreen(page, { x: 360, y: 280 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("[data-ocr-scope-busy]")).toBeVisible();
  await snap(page, "box-rescanning");

  await expect(ocrLayer(page)).toContainText("Left three");
  await expect(page.locator("[data-ocr-scope-busy]")).toHaveCount(0);
  expect(await selectedText(page)).toBe("Left one\nLeft two\nLeft three");
  await snap(page, "rescan-merged-and-selected");
});
