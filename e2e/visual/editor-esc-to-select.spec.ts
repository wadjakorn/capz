import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, snap } from "./helpers";

// Visual check for CP-0069: with a shape selected on a sticky tool, one Esc
// deselects it and returns to the Select tool.

/** Annotations attached to a Transformer on the live stage (0 = nothing selected). */
function selectedCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    type Tr = { nodes(): unknown[] };
    const stage = (window as unknown as { __capzStage?: { find(sel: string): Tr[] } })
      .__capzStage;
    if (!stage) return -1;
    return stage.find("Transformer").reduce((n, t) => n + t.nodes().length, 0);
  });
}

test("one Esc deselects and returns from a sticky tool to Select", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  const shapes = page.getByRole("button", { name: "Shapes", exact: true });
  const select = page.getByRole("button", { name: "Select", exact: true });
  const active = /bg-\[var\(--accent\)\]/;

  // Shapes is sticky by default, so it is still active; select the new rect
  // by clicking inside it.
  await expect(shapes).toHaveClass(active);
  const box = (await page.locator("canvas").first().boundingBox())!;
  if ((await selectedCount(page)) === 0) await page.mouse.click(box.x + 140, box.y + 120);
  await expect.poll(() => selectedCount(page)).toBeGreaterThan(0);
  await expect(shapes).toHaveClass(active);
  await snap(page, "selected-on-shapes-tool");

  await page.keyboard.press("Escape");
  await snap(page, "after-one-esc");
  await expect.poll(() => selectedCount(page)).toBe(0);
  await expect(select).toHaveClass(active);
  await expect(shapes).not.toHaveClass(active);
});
