import { test, expect } from "../fixtures/test";
import { loadImage, snap, stageBox } from "./helpers";

// Visual check for CP-0065: the text being typed sits where — and looks like —
// the committed text. Compare the "editing" and "committed" snaps: same spot,
// same size and style; only the dashed outline goes away on commit.

test("text looks the same while editing and after commit", async ({ page }) => {
  await loadImage(page);
  await page.keyboard.press("Control+1");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await stageBox(page))!;
  await page.mouse.click(box.x + 120, box.y + 120);
  const editor = page.locator("textarea");
  await expect(editor).toBeVisible();
  await editor.pressSequentially("Hello สวัสดี");
  await snap(page, "editing");
  const editing = (await page.getByTestId("text-editor-box").boundingBox())!;

  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  await snap(page, "committed");

  // Re-edit: the overlay lands back on the same box.
  await page.mouse.dblclick(
    editing.x + editing.width / 2,
    editing.y + editing.height / 2,
  );
  await expect(page.locator("textarea")).toBeVisible();
  await snap(page, "re-editing");
  const again = (await page.getByTestId("text-editor-box").boundingBox())!;
  expect(Math.abs(again.x - editing.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(again.y - editing.y)).toBeLessThanOrEqual(2);
});
