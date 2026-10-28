import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";
import { loadImage, mouseDrag, snap, stageBox } from "./helpers";

// CP-0077: a Shapes option picked right after drawing (inside EditorStage's
// 500 ms debounced lastUsed write) must survive that write.

/** Konva class of every Shapes-tool annotation, in draw order
 *  (Rect = rect, Shape = ellipse). */
function shapeClasses(page: Page) {
  return page.evaluate(() => {
    type Node = { getClassName(): string; stroke?(): string };
    const stage = (window as unknown as { __capzStage?: { find(sel: (n: Node) => boolean): Node[] } })
      .__capzStage;
    if (!stage) return [];
    return stage
      .find((n) => ["Rect", "Shape"].includes(n.getClassName()) && n.stroke?.() === "#ef4444")
      .map((n) => n.getClassName());
  });
}

/** Esc → Shapes → Circle, run in-page so it lands well inside the 500 ms
 *  window even on a loaded runner. Returns ms since the draw's mouseup. */
function escThenPickCircle(page: Page) {
  return page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const button = async (name: string) => {
      for (let i = 0; i < 120; i++) {
        const b = [...document.querySelectorAll("button")].find(
          (el) =>
            [el.getAttribute("aria-label"), el.getAttribute("title"), el.textContent?.trim()].includes(
              name,
            ),
        );
        if (b) return b;
        await frame();
      }
      throw new Error(`no button ${name}`);
    };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frame();
    (await button("Shapes")).click();
    await frame();
    (await button("Circle")).click();
    return performance.now() - (window as unknown as { __upAt: number }).__upAt;
  });
}

test("Circle picked within 500 ms of drawing a rect is kept", async ({ page }) => {
  await loadImage(page);
  const box = await stageBox(page);
  const pick = (name: string) => page.getByRole("button", { name, exact: true }).click();

  await pick("Shapes");
  await pick("Rectangle");
  await page.evaluate(() =>
    window.addEventListener("mouseup", () => {
      (window as unknown as { __upAt: number }).__upAt = performance.now();
    }),
  );
  await mouseDrag(page, { x: box.x + 60, y: box.y + 60 }, { x: box.x + 220, y: box.y + 180 });
  const elapsed = await escThenPickCircle(page);
  expect(elapsed, "pick must land inside the debounce window").toBeLessThan(500);
  await snap(page, "circle-picked-right-after-rect");

  // Let the debounced write flush; it must not revert the pick.
  await page.waitForTimeout(800);
  await mouseDrag(page, { x: box.x + 300, y: box.y + 60 }, { x: box.x + 460, y: box.y + 180 });
  await page.keyboard.press("Escape");
  await snap(page, "second-draw-is-a-circle");

  await expect.poll(() => shapeClasses(page)).toEqual(["Rect", "Shape"]);
});
