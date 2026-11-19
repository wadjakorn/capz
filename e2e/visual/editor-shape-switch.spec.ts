import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, rectPositions, snap } from "./helpers";

// CP-0102: the shape picker stays visible for a selected shape and switches
// rectangle ↔ circle in place; Line is shown disabled (a box can't become a line).

test("a selected rectangle switches to a circle in place, undoable", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  // A freshly drawn shape is selected.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + 60, box.y + 120); // on the left edge stroke
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);

  const circle = page.getByRole("button", { name: "Circle", exact: true });
  const line = page.getByRole("button", { name: "Line", exact: true });
  await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(line).toHaveAttribute("aria-disabled", "true");
  await expect(line).toHaveAttribute("title", "Can't turn a box into a line — draw a new one");
  await snap(page, "rect-selected-picker-visible");

  await circle.click();
  await expect(circle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(0);
  await snap(page, "after-switch-to-circle");

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);
  await snap(page, "after-undo");
});

test("re-clicking the active shape adds no undo step", async ({ page }) => {
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + 60, box.y + 120);
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);
  const circle = page.getByRole("button", { name: "Circle", exact: true });
  await circle.click();
  await expect.poll(async () => (await rectPositions(page)).length).toBe(0);
  await circle.click(); // already a circle: nothing to undo
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);
});
