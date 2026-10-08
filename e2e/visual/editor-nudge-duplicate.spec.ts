import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, rectPositions, snap } from "./helpers";

// Reference visual check for CP-0056 (arrow-key nudge) and CP-0057 (⌘/Ctrl+D
// duplicate). Also the template capz-build-ticket copies for new L4 checks:
// load → act → snap before/after → assert on the live stage, not on pixels.

test("arrow keys nudge and Ctrl+D duplicates the selected shape", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const [start] = await rectPositions(page);
  expect(start).toBeTruthy();

  // Select the shape by clicking inside it.
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + 140, box.y + 120);
  await snap(page, "selected");

  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("ArrowDown");
  await snap(page, "after-nudge-30-right-1-down");
  const [moved] = await rectPositions(page);
  expect(moved.x - start.x).toBeGreaterThan(0);
  expect(moved.y - start.y).toBeGreaterThan(0);

  await page.keyboard.press("Control+d");
  await snap(page, "after-duplicate");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(2);
});
