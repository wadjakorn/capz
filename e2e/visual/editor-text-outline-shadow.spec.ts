import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { loadImage, snap, stageBox } from "./helpers";

// CP-0106: outline + shadow on a text annotation. Thai upper vowels and tone
// marks ("ที่นี่ น้ำ ปั๊ม") must stay legible with the widest outline on: the
// outline is drawn behind the fill, so the white glyph fill must still show.

/** Count red (outline) and white (fill) pixels inside the text node's box. */
function textInk(page: Page) {
  return page.evaluate(() => {
    type K = {
      find(sel: string): {
        getClientRect(o?: object): { x: number; y: number; width: number; height: number };
        getAttr(k: string): unknown;
      }[];
      toCanvas(o?: object): HTMLCanvasElement;
      scaleX(): number;
    };
    const stage = (window as unknown as { __capzStage?: K }).__capzStage!;
    const node = stage.find("Text").find((n) => String(n.getAttr("text")).includes("ปั๊ม"))!;
    const r = node.getClientRect();
    const pad = 12;
    const c = stage.toCanvas({
      x: r.x - pad,
      y: r.y - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
      pixelRatio: 1,
    });
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] < 70) red++;
      if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++;
    }
    return {
      red,
      white,
      stroke: node.getAttr("stroke"),
      strokeWidth: node.getAttr("strokeWidth"),
      fillAfter: node.getAttr("fillAfterStrokeEnabled"),
      shadowBlur: node.getAttr("shadowBlur"),
    };
  });
}

test("text outline and shadow keep Thai marks legible", async ({ page }) => {
  await loadImage(page);
  await page.keyboard.press("Control+1");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  // White 48 px text, no background box.
  await page.locator('label[title="Text color"] input').fill("#ffffff");
  await page.getByRole("button", { name: "Size 48 px" }).click();
  await page.getByRole("button", { name: "Fill on" }).click();

  const box = await stageBox(page);
  await page.mouse.click(box.x + 80, box.y + 120);
  const editor = page.locator("textarea");
  await expect(editor).toBeVisible();
  await editor.pressSequentially("ที่นี่ น้ำ ปั๊ม");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.click(box.x + 120, box.y + 150);
  await expect(page.getByRole("button", { name: "Outline off" })).toBeVisible();
  await snap(page, "plain");
  const plain = await textInk(page);
  expect(plain.red).toBe(0);
  expect(plain.white).toBeGreaterThan(50);

  await page.getByRole("button", { name: "Outline off" }).click();
  await page.getByTitle("Outline color").fill("#ff0000");
  await page.getByRole("button", { name: "Width 8 px" }).click();
  await snap(page, "outline-8px");
  const outlined = await textInk(page);
  expect(outlined.stroke).toBe("#ff0000");
  expect(outlined.strokeWidth).toBe(16);
  expect(outlined.fillAfter).toBe(true);
  expect(outlined.red).toBeGreaterThan(200);
  // The fill still shows on top of the outline: most of the white survives.
  expect(outlined.white).toBeGreaterThan(plain.white * 0.6);

  await page.getByRole("button", { name: "Shadow off" }).click();
  await expect(page.getByRole("button", { name: "Shadow on" })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250); // let the chip's colour transition finish for the snap
  await snap(page, "outline-and-shadow");
  const shadowed = await textInk(page);
  expect(shadowed.shadowBlur).toBeGreaterThan(0);

  // Undo removes the shadow again.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await textInk(page)).shadowBlur ?? 0).toBe(0);

  // Re-edit: the editing overlay mirrors the outline.
  await page.keyboard.press("Escape");
  await page.mouse.dblclick(box.x + 120, box.y + 150);
  await expect(page.locator("textarea")).toBeVisible();
  await snap(page, "editing-with-outline");
  const stroke = await page.locator("textarea").evaluate((el) => (el as HTMLTextAreaElement).style.webkitTextStroke);
  expect(stroke).toContain("rgb(255, 0, 0)");
});
