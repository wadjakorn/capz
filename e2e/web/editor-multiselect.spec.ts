import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";
import { loadImage, mouseDrag, stageBox } from "../visual/helpers";

// CP-0050: Ctrl-click (Cmd on macOS) and a marquee with the Select tool build a
// multi-selection that moves, restyles, deletes and undoes as one. Asserts on
// the live Konva stage (window.__capzStage under NEXT_PUBLIC_TEST=1).

type KNode = {
  x(): number;
  y(): number;
  name(): string;
  stroke(): string;
  dash(): number[] | undefined;
  getClassName(): string;
  getLayer(): { name(): string } | null;
};

/** Shapes-tool rects (default stroke #ef4444), in draw order. */
function rects(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: { find(s: string): KNode[] } }).__capzStage;
    if (!stage) return [];
    return stage
      .find("Rect")
      .filter((n) => n.stroke?.() === "#ef4444" && n.getLayer()?.name() !== "screen-chrome")
      .map((n) => ({ x: Math.round(n.x()), y: Math.round(n.y()), dashed: (n.dash() ?? []).length > 0 }));
  });
}

function outlines(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: { find(s: string): KNode[] } }).__capzStage;
    return stage ? stage.find(".multi-select-outline").length : -1;
  });
}

async function selectTool(page: Page) {
  await page.getByRole("button", { name: "Select", exact: true }).click();
}

async function setup(page: Page) {
  await loadImage(page, "#ffffff");
  const box = await stageBox(page);
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await mouseDrag(page, at(40, 40), at(120, 100));
  await mouseDrag(page, at(160, 40), at(240, 100));
  await mouseDrag(page, at(280, 40), at(360, 100));
  await expect.poll(async () => (await rects(page)).length).toBe(3);
  await selectTool(page);
  await page.keyboard.press("Escape");
  return at;
}

test("marquee selects only fully covered shapes; group drag + one undo", async ({ page }) => {
  const at = await setup(page);
  const before = await rects(page);

  // Covers the first two fully and the third only halfway.
  await mouseDrag(page, at(20, 20), at(320, 120));
  await expect.poll(() => outlines(page)).toBe(2);
  await expect(page.getByTestId("multi-select-info")).toContainText("2 items selected");

  // Drag the first shape: both selected shapes move, the third stays.
  await mouseDrag(page, at(80, 70), at(140, 150));
  const after = await rects(page);
  const dx = after[0].x - before[0].x;
  const dy = after[0].y - before[0].y;
  expect(dx).toBeGreaterThan(10);
  expect(dy).toBeGreaterThan(10);
  expect(after[1].x - before[1].x).toBe(dx);
  expect(after[1].y - before[1].y).toBe(dy);
  expect(after[2]).toEqual(before[2]);

  await page.keyboard.press("Control+z");
  await expect.poll(() => rects(page)).toEqual(before);
});

test("a click on empty canvas after a marquee deselects", async ({ page }) => {
  const at = await setup(page);
  await mouseDrag(page, at(20, 20), at(380, 120));
  await expect.poll(() => outlines(page)).toBe(3);
  await page.mouse.click(at(500, 400).x, at(500, 400).y);
  await expect.poll(() => outlines(page)).toBe(0);
});

test("Ctrl-click toggles membership; a plain click selects just one", async ({ page }) => {
  const at = await setup(page);
  await page.mouse.click(at(80, 70).x, at(80, 70).y);
  await page.keyboard.down("Control");
  await page.mouse.click(at(320, 70).x, at(320, 70).y);
  await page.keyboard.up("Control");
  await expect.poll(() => outlines(page)).toBe(2);

  await page.keyboard.down("Control");
  await page.mouse.click(at(200, 70).x, at(200, 70).y);
  await page.keyboard.up("Control");
  await expect.poll(() => outlines(page)).toBe(3);

  await page.keyboard.down("Control");
  await page.mouse.click(at(80, 70).x, at(80, 70).y);
  await page.keyboard.up("Control");
  await expect.poll(() => outlines(page)).toBe(2);

  // Plain click on a member collapses the selection to it.
  await page.mouse.click(at(200, 70).x, at(200, 70).y);
  await expect.poll(() => outlines(page)).toBe(0);
});

test("same-type selection restyles together in one undo step", async ({ page }) => {
  const at = await setup(page);
  await mouseDrag(page, at(20, 20), at(380, 120));
  await expect.poll(() => outlines(page)).toBe(3);
  await page.getByRole("button", { name: "Dashed", exact: true }).click();
  await expect.poll(async () => (await rects(page)).map((r) => r.dashed)).toEqual([true, true, true]);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await rects(page)).map((r) => r.dashed)).toEqual([false, false, false]);
});

test("mixed-type selection shows the hint instead of style controls", async ({ page }) => {
  const at = await setup(page);
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await page.mouse.click(at(200, 200).x, at(200, 200).y);
  await selectTool(page);
  await page.keyboard.press("Escape");
  await mouseDrag(page, at(20, 20), at(380, 260));
  await expect(page.getByTestId("multi-select-mixed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dashed", exact: true })).toHaveCount(0);
});

test("Delete removes the whole selection; arrows nudge it", async ({ page }) => {
  const at = await setup(page);
  const before = await rects(page);
  await mouseDrag(page, at(20, 20), at(250, 120));
  await expect.poll(() => outlines(page)).toBe(2);

  await page.keyboard.press("Shift+ArrowRight");
  const nudged = await rects(page);
  expect(nudged[0].x - before[0].x).toBe(10);
  expect(nudged[1].x - before[1].x).toBe(10);
  expect(nudged[2]).toEqual(before[2]);

  await page.keyboard.press("Delete");
  await expect.poll(async () => (await rects(page)).length).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await rects(page)).length).toBe(3);
});

test("an arrow moves with the group and does not double-shift", async ({ page }) => {
  const at = await setup(page);
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await mouseDrag(page, at(60, 200), at(200, 260));
  await selectTool(page);
  await page.keyboard.press("Escape");
  const arrowPts = () =>
    page.evaluate(() => {
      type A = { getClassName(): string; points(): number[]; x(): number; y(): number };
      const stage = (window as unknown as { __capzStage?: { find(s: string): A[] } }).__capzStage;
      const a = stage?.find("Arrow")[0];
      return a ? { p: a.points().map(Math.round), x: a.x(), y: a.y() } : null;
    });
  const before = await arrowPts();
  const r0 = (await rects(page))[0];

  await mouseDrag(page, at(20, 20), at(215, 280)); // first rect + the arrow (second rect only half)
  await expect.poll(() => outlines(page)).toBe(2);
  await mouseDrag(page, at(80, 70), at(130, 110));
  await page.waitForTimeout(200);

  const r1 = (await rects(page))[0];
  const after = await arrowPts();
  const dx = r1.x - r0.x;
  const dy = r1.y - r0.y;
  expect(dx).toBeGreaterThan(10);
  expect(after!.x).toBe(0);
  expect(after!.y).toBe(0);
  expect(after!.p[0] - before!.p[0]).toBe(dx);
  expect(after!.p[1] - before!.p[1]).toBe(dy);
});
