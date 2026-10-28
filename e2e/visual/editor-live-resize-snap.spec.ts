import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, mouseDrag, snap, stageBox } from "./helpers";

// CP-0025: resizing is magnetic *while the handle is held* — the edge sticks
// and the guide shows before release — arrow handles snap too, canvas guides
// look different from element guides, and the bypass key turns it all off.

type KNode = {
  getChildren(): KNode[];
  getClientRect(o?: { skipStroke?: boolean }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getParent(): { className?: string; hasName(n: string): boolean } | null;
  isVisible(): boolean;
  width(): number;
  stroke?(): string;
  points?(): number[];
};
type Stage = {
  find(sel: string): KNode[];
  container(): HTMLElement;
  scaleX(): number;
};

/** Strokes of the guide lines currently mounted in the screen-chrome layer. */
function guideStrokes(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage;
    if (!stage) return [];
    return stage
      .find(".screen-chrome")
      .flatMap((l) => l.getChildren())
      .map((n) => n.stroke?.() ?? "");
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
        // Geometry only: snap lines are the shape's box, not its stroke.
        const r = n.getClientRect({ skipStroke: true });
        return { x: origin.x + r.x, y: origin.y + r.y, w: r.width, h: r.height };
      })
      .sort((p, q) => p.x - q.x);
  });
}

/** Centre of a transformer anchor (e.g. "bottom-center") in page coordinates. */
function anchorCenter(page: Page, name: string) {
  return page.evaluate((name) => {
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage;
    const a = stage
      ?.find(`.${name}`)
      .find((n) => !n.getParent()?.hasName("hover-tr") && n.isVisible());
    if (!stage || !a) return null;
    const origin = stage.container().getBoundingClientRect();
    const r = a.getClientRect();
    return { x: origin.x + r.x + r.width / 2, y: origin.y + r.y + r.height / 2 };
  }, name);
}

/** Arrow head in page coordinates. */
function arrowHead(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: Stage }).__capzStage;
    const arrow = stage?.find("Arrow")[0];
    if (!stage || !arrow?.points) return null;
    const p = arrow.points();
    const origin = stage.container().getBoundingClientRect();
    const s = stage.scaleX();
    return { x: origin.x + p[p.length - 2] * s, y: origin.y + p[p.length - 1] * s };
  });
}

/** Press, then move in small steps — but do NOT release. */
async function holdDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
}

async function twoRectsSecondSelected(page: Page) {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await drawRect(page, { x: 300, y: 60 }, { x: 460, y: 210 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await stageBox(page);
  await page.mouse.click(box.x + 380, box.y + 130);
  await expect.poll(() => anchorCenter(page, "bottom-center")).not.toBeNull();
}

test("a resize edge sticks to a target and shows its guide before release", async ({ page }) => {
  await twoRectsSecondSelected(page);
  await snap(page, "two-rects-second-selected");

  const [a, b] = await rectBoxes(page);
  const handle = (await anchorCenter(page, "bottom-center"))!;
  // Hold the bottom edge 3 screen px below the first rect's bottom.
  const targetY = a.y + a.h + 3;
  await holdDrag(page, handle, { x: handle.x, y: handle.y - (b.y + b.h - targetY) });

  // Mid-gesture: already aligned, guide visible (green = element guide).
  const [, live] = await rectBoxes(page);
  expect(Math.abs(live.y + live.h - (a.y + a.h))).toBeLessThan(1.5);
  await expect.poll(async () => (await guideStrokes(page)).length).toBeGreaterThan(0);
  expect(await guideStrokes(page)).toContain("#34d399");
  await snap(page, "mid-resize-guide-visible");

  await page.mouse.up();
  await expect.poll(async () => (await guideStrokes(page)).length).toBe(0);
  const [, done] = await rectBoxes(page);
  expect(Math.abs(done.y + done.h - (a.y + a.h))).toBeLessThan(1.5);
  await snap(page, "after-release");
});

test("canvas guides are drawn in a different colour from element guides", async ({ page }) => {
  await twoRectsSecondSelected(page);
  const box = await stageBox(page);
  const handle = (await anchorCenter(page, "middle-right"))!;
  // Pull the right edge to 3 screen px short of the image's right edge.
  await holdDrag(page, handle, { x: box.x + box.width - 3, y: handle.y });
  await expect.poll(() => guideStrokes(page)).toContain("#e879f9");
  const [, live] = await rectBoxes(page);
  expect(Math.abs(live.x + live.w - (box.x + box.width))).toBeLessThan(1.5);
  await snap(page, "mid-resize-canvas-guide");
  await page.mouse.up();
  await expect.poll(async () => (await guideStrokes(page)).length).toBe(0);
});

test("holding the bypass key (Ctrl off macOS by default) resizes freely", async ({ page }) => {
  await twoRectsSecondSelected(page);
  const [a, b] = await rectBoxes(page);
  const handle = (await anchorCenter(page, "bottom-center"))!;
  const targetY = a.y + a.h + 3;
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.keyboard.down("Control");
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(handle.x, handle.y - ((b.y + b.h - targetY) * i) / 10);
  }
  const [, live] = await rectBoxes(page);
  expect(Math.abs(live.y + live.h - (a.y + a.h))).toBeGreaterThan(2);
  expect(await guideStrokes(page)).toEqual([]);
  await snap(page, "bypass-held-no-snap");
  await page.mouse.up();
  await page.keyboard.up("Control");
});

test("an arrow's head handle snaps to another element's edge", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 200, y: 60 }, { x: 320, y: 200 });
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  const box = await stageBox(page);
  await mouseDrag(page, { x: box.x + 40, y: box.y + 260 }, { x: box.x + 120, y: box.y + 300 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.click(box.x + 80, box.y + 280);

  const [r] = await rectBoxes(page);
  const head = (await arrowHead(page))!;
  // Hold the head 3 screen px left of the rect's left edge.
  await holdDrag(page, head, { x: r.x - 3, y: head.y + 7 });
  await expect.poll(async () => (await guideStrokes(page)).length).toBeGreaterThan(0);
  const live = (await arrowHead(page))!;
  expect(Math.abs(live.x - r.x)).toBeLessThan(1.5);
  await snap(page, "arrow-head-snapped");
  await page.mouse.up();
  await expect.poll(async () => (await guideStrokes(page)).length).toBe(0);
  const done = (await arrowHead(page))!;
  expect(Math.abs(done.x - r.x)).toBeLessThan(1.5);
});

test("a text box snaps live while resized from a corner", async ({ page }) => {
  await loadImage(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = await stageBox(page);
  await page.mouse.click(box.x + 120, box.y + 120);
  const editor = page.locator("textarea");
  await expect(editor).toBeVisible();
  await editor.pressSequentially("Hello");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.click(box.x + 130, box.y + 130);
  await expect.poll(() => anchorCenter(page, "bottom-right")).not.toBeNull();
  await snap(page, "text-selected");

  // Hold the corner 3 screen px left of the image's vertical centre line.
  // Corners are ratio-locked, so move along the box's diagonal.
  const corner = (await anchorCenter(page, "bottom-right"))!;
  const origin = (await anchorCenter(page, "top-left"))!;
  const centreX = box.x + box.width / 2;
  const dx = centreX - 3 - corner.x;
  const dy = (dx * (corner.y - origin.y)) / (corner.x - origin.x);
  await holdDrag(page, corner, { x: corner.x + dx, y: corner.y + dy });
  await expect.poll(() => guideStrokes(page)).toContain("#e879f9");
  const right = (await anchorCenter(page, "middle-right"))!;
  expect(Math.abs(right.x - centreX)).toBeLessThan(1.5);
  await snap(page, "text-mid-resize-snapped");
  await page.mouse.up();
  await expect.poll(async () => (await guideStrokes(page)).length).toBe(0);
});

test("a rotated rect snaps by the box it is drawn in, not its un-rotated frame", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 80, y: 60 }, { x: 240, y: 120 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await stageBox(page);
  await page.mouse.click(box.x + 160, box.y + 90);
  await expect.poll(() => anchorCenter(page, "rotater")).not.toBeNull();
  const rotater = await anchorCenter(page, "rotater");
  // Turn it 90°: swing the rotater from above the centre to its right.
  const [r0] = await rectBoxes(page);
  const c0 = { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 };
  await mouseDrag(page, rotater!, { x: c0.x + 120, y: c0.y });
  const [turned] = await rectBoxes(page);
  expect(turned.h).toBeGreaterThan(turned.w); // now tall, not wide
  await snap(page, "rotated-90");

  // Drag so the drawn box's centre is 3 screen px right of the canvas centre.
  const centreX = box.x + box.width / 2;
  const from = { x: turned.x + turned.w / 2, y: turned.y + turned.h / 2 };
  await holdDrag(page, from, { x: centreX + 3, y: from.y + 140 });
  await expect.poll(() => guideStrokes(page)).toContain("#e879f9");
  const [live] = await rectBoxes(page);
  expect(Math.abs(live.x + live.w / 2 - centreX)).toBeLessThan(1.5);
  await snap(page, "rotated-centre-snapped");
  await page.mouse.up();
  await expect.poll(async () => (await guideStrokes(page)).length).toBe(0);
});
