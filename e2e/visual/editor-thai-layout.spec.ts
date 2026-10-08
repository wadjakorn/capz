import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, rectPositions, snap } from "./helpers";

// CP-0061: with the Thai (Kedmanee) layout active, e.key is a Thai character
// ("ผ" for the Z key). Playwright can't switch layouts, so dispatch the
// KeyboardEvent a Thai layout produces: Thai key + physical code.

function thaiKey(page: Page, key: string, code: string, opts: KeyboardEventInit = {}) {
  return page.evaluate(
    ([key, code, opts]) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true, ...opts }),
      );
    },
    [key, code, opts] as const,
  );
}

test("Thai-layout Ctrl+Z / Ctrl+Y / Ctrl+D undo, redo and duplicate", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await snap(page, "drawn");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);

  await thaiKey(page, "ผ", "KeyZ", { ctrlKey: true });
  await snap(page, "after-thai-ctrl-z");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(0);

  await thaiKey(page, "ั", "KeyY", { ctrlKey: true });
  await snap(page, "after-thai-ctrl-y");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);

  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + 140, box.y + 120);
  await thaiKey(page, "ก", "KeyD", { ctrlKey: true });
  await snap(page, "after-thai-ctrl-d");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(2);
});
