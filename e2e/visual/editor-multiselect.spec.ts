import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, mouseDrag, snap, stageBox } from "./helpers";

// L4 visual check for CP-0050: marquee → per-member outlines → group drag.

test("marquee selects two shapes and they drag together", async ({ page }) => {
  await loadImage(page, "#ffffff");
  await drawRect(page, { x: 40, y: 40 }, { x: 140, y: 120 });
  await drawRect(page, { x: 180, y: 40 }, { x: 280, y: 120 });
  await drawRect(page, { x: 320, y: 40 }, { x: 420, y: 120 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.keyboard.press("Escape");
  await snap(page, "three-shapes");

  const box = await stageBox(page);
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
  // Hold the marquee mid-drag for a screenshot; it covers the third shape halfway.
  await page.mouse.move(at(20, 20).x, at(20, 20).y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const p = at(20 + 350 * (i / 8), 20 + 120 * (i / 8));
    await page.mouse.move(p.x, p.y);
  }
  await snap(page, "marquee-in-progress");
  await page.mouse.up();
  await snap(page, "two-selected-outlines");

  const outlines = () =>
    page.evaluate(() => {
      const st = (window as unknown as { __capzStage?: { find(s: string): unknown[] } }).__capzStage;
      return st ? st.find(".multi-select-outline").length : -1;
    });
  await expect.poll(outlines).toBe(2);

  await mouseDrag(page, at(90, 80), at(150, 220));
  await snap(page, "after-group-drag");
  await expect.poll(outlines).toBe(2);
});
