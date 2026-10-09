import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { loadImage, mouseDrag, snap, stageBox } from "./helpers";

// CP-0066: the highlighter screens over dark backgrounds (bright yellow on
// black) and still multiplies over light ones (yellow on white).

/** Blend mode of the committed highlighter line and the stage pixel at the
 *  stage's centre, where the stroke runs. */
function probe(page: Page) {
  return page.evaluate(() => {
    type Line = { getClassName(): string; globalCompositeOperation(): string; opacity(): number };
    type Stage = {
      find(sel: string): Line[];
      width(): number;
      height(): number;
      toCanvas(o: { pixelRatio: number }): HTMLCanvasElement;
    };
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage!;
    const line = stage.find("Line").find((n) => n.opacity() < 1);
    const c = stage.toCanvas({ pixelRatio: 1 });
    const px = c
      .getContext("2d")!
      .getImageData(Math.round(stage.width() / 2), Math.round(stage.height() / 2), 1, 1).data;
    return { blend: line?.globalCompositeOperation(), rgb: [px[0], px[1], px[2]] };
  });
}

async function drawHighlight(page: Page) {
  await page.getByRole("button", { name: "Highlighter", exact: true }).click();
  const box = await stageBox(page);
  const cy = box.y + box.height / 2;
  await mouseDrag(page, { x: box.x + box.width / 2 - 120, y: cy }, { x: box.x + box.width / 2 + 120, y: cy });
}

test("highlighter stays bright on a black background", async ({ page }) => {
  await loadImage(page, "#000000");
  await snap(page, "black-before");
  await drawHighlight(page);
  await snap(page, "black-after-highlight");
  await expect.poll(async () => (await probe(page)).blend).toBe("screen");
  const { rgb } = await probe(page);
  // Default #facc15 at 50%: clearly yellow, not the near-black multiply gives.
  expect(rgb[0]).toBeGreaterThan(100);
  expect(rgb[1]).toBeGreaterThan(80);
});

test("highlighter still multiplies on a white background", async ({ page }) => {
  await loadImage(page, "#ffffff");
  await drawHighlight(page);
  await snap(page, "white-after-highlight");
  await expect.poll(async () => (await probe(page)).blend).toBe("multiply");
  const { rgb } = await probe(page);
  // Yellow on white: red/green stay high, blue drops.
  expect(rgb[0]).toBeGreaterThan(200);
  expect(rgb[2]).toBeLessThan(200);
});
