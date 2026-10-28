import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, mouseDrag, snap, stageBox } from "./helpers";

// CP-0079: the green snap guides must disappear when the pointer is released —
// a snapped resize used to leave them on screen (and then in save/copy).

type Stage = {
  find(sel: string): Array<{
    getChildren(): unknown[];
    getClientRect(): { x: number; y: number; width: number; height: number };
    getParent(): { className?: string; hasName(n: string): boolean } | null;
    isVisible(): boolean;
    width(): number;
  }>;
  container(): HTMLElement;
};

/** Number of guide lines currently mounted in the screen-chrome layer. */
function guideCount(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage;
    if (!stage) return -1;
    return stage.find(".screen-chrome").reduce((n, l) => n + l.getChildren().length, 0);
  });
}

/** Annotation rect boxes in page (CSS) coordinates. */
function rectBoxes(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage;
    if (!stage) return [];
    const origin = stage.container().getBoundingClientRect();
    return stage
      .find("Rect")
      .filter((n) => n.getParent()?.className !== "Transformer" && n.width() < 800)
      .map((n) => {
        const r = n.getClientRect();
        return { x: origin.x + r.x, y: origin.y + r.y, w: r.width, h: r.height };
      });
  });
}

/** Centre of a transformer anchor (e.g. "bottom-center") in page coordinates. */
function anchorCenter(page: Page, name: string) {
  return page.evaluate((name) => {
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage;
    // Skip the hover outline's (non-interactive) transformer.
    const a = stage
      ?.find(`.${name}`)
      .find((n) => !n.getParent()?.hasName("hover-tr") && n.isVisible());
    if (!stage || !a) return null;
    const origin = stage.container().getBoundingClientRect();
    const r = a.getClientRect();
    return { x: origin.x + r.x + r.width / 2, y: origin.y + r.y + r.height / 2 };
  }, name);
}

test("snap guides clear after a snapped resize and after a drag", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await drawRect(page, { x: 300, y: 60 }, { x: 460, y: 210 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await stageBox(page);
  await page.mouse.click(box.x + 380, box.y + 130);
  await expect.poll(() => anchorCenter(page, "bottom-center")).not.toBeNull();
  await snap(page, "two-rects-second-selected");

  // Resize the second rect so its bottom edge lands 2px from the first's.
  const [a, b] = (await rectBoxes(page)).sort((p, q) => p.x - q.x);
  const handle = (await anchorCenter(page, "bottom-center"))!;
  const targetY = a.y + a.h + 2;
  await mouseDrag(page, handle, { x: handle.x, y: handle.y - (b.y + b.h - targetY) });
  await snap(page, "after-snapped-resize");

  const [, resized] = (await rectBoxes(page)).sort((p, q) => p.x - q.x);
  // It snapped (bottoms aligned) …
  expect(Math.abs(resized.y + resized.h - (a.y + a.h))).toBeLessThan(1.5);
  // … and no guide survived the release.
  await expect.poll(() => guideCount(page)).toBe(0);

  // A drag shows guides while held and clears them on release.
  const from = { x: resized.x + resized.w / 2, y: resized.y + resized.h / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + i * 2, from.y + (a.y - resized.y + 1) * (i / 8));
  await expect.poll(() => guideCount(page)).toBeGreaterThan(0);
  await snap(page, "dragging-guides-visible");
  await page.mouse.up();
  await expect.poll(() => guideCount(page)).toBe(0);
  await snap(page, "after-drag-release");
});
