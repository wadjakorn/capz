import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { loadImage, mouseDrag, snap, stageBox } from "./helpers";

// CP-0066: the highlighter screens over dark pixels (bright yellow on black)
// and multiplies over light ones (yellow on white) — per pixel, so one stroke
// across a dark and a light area reads as a highlight on both.

/** Stage pixel `dx` CSS px right of the stage's centre, where the stroke runs. */
function pixel(page: Page, dx = 0) {
  return page.evaluate((dx) => {
    type Stage = {
      width(): number;
      height(): number;
      toCanvas(o: { pixelRatio: number }): HTMLCanvasElement;
    };
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage!;
    const c = stage.toCanvas({ pixelRatio: 1 });
    const px = c
      .getContext("2d")!
      .getImageData(Math.round(stage.width() / 2 + dx), Math.round(stage.height() / 2), 1, 1).data;
    return [px[0], px[1], px[2]];
  }, dx);
}

async function drawHighlight(page: Page) {
  await page.getByRole("button", { name: "Highlighter", exact: true }).click();
  const box = await stageBox(page);
  const cy = box.y + box.height / 2;
  await mouseDrag(page, { x: box.x + box.width / 2 - 120, y: cy }, { x: box.x + box.width / 2 + 120, y: cy });
}

/** Default #facc15 at 50%: clearly yellow, not the near-black multiply gives. */
const brightOnBlack = (rgb: number[]) => rgb[0] > 100 && rgb[1] > 80;
/** Yellow on white: red/green stay high, blue drops. */
const yellowOnWhite = (rgb: number[]) => rgb[0] > 200 && rgb[1] > 180 && rgb[2] < 200;

test("highlighter stays bright on a black background", async ({ page }) => {
  await loadImage(page, "#000000");
  await snap(page, "black-before");
  await drawHighlight(page);
  await snap(page, "black-after-highlight");
  await expect.poll(async () => brightOnBlack(await pixel(page))).toBe(true);
});

test("highlighter still multiplies on a white background", async ({ page }) => {
  await loadImage(page, "#ffffff");
  await drawHighlight(page);
  await snap(page, "white-after-highlight");
  await expect.poll(async () => yellowOnWhite(await pixel(page))).toBe(true);
});

test("one stroke across black and white highlights both halves", async ({ page }) => {
  await loadImage(page, "#000000", "#ffffff");
  await drawHighlight(page);
  await snap(page, "split-after-highlight");
  await expect.poll(async () => brightOnBlack(await pixel(page, -60))).toBe(true);
  expect(yellowOnWhite(await pixel(page, 60))).toBe(true);
});

test("light text on a dark panel stays light under the highlight", async ({ page }) => {
  // The mode follows the panel, not the glyph: the light bar is screened with
  // its dark surroundings (stays near-white) instead of multiplied to yellow.
  await loadImage(page, "#1a2238", undefined, "#e5e7eb");
  await drawHighlight(page);
  await snap(page, "dark-text-after-highlight");
  await expect.poll(async () => brightOnBlack(await pixel(page, -60))).toBe(true);
  const glyph = await pixel(page, 0);
  expect(glyph[2]).toBeGreaterThan(180);
});
