import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, rectPositions, snap } from "./helpers";

// CP-0059: on a non-Mac browser the undo/redo tooltips read Ctrl+…, and
// Ctrl+Z / Ctrl+Y undo and redo a shape on the live stage.

test("undo/redo hints say Ctrl and Ctrl+Y redoes", async ({ page }) => {
  await loadImage(page);
  const undoBtn = page.getByRole("button", { name: "Undo", exact: true });
  const redoBtn = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undoBtn).toHaveAttribute("title", "Undo (Ctrl+Z)");
  await expect(redoBtn).toHaveAttribute("title", "Redo (Ctrl+Shift+Z)");

  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await snap(page, "drawn");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);

  await page.keyboard.press("Control+z");
  await snap(page, "after-ctrl-z");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(0);

  await page.keyboard.press("Control+y");
  await snap(page, "after-ctrl-y");
  await expect.poll(async () => (await rectPositions(page)).length).toBe(1);
});
