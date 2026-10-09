import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { drawRect, loadImage, rectPositions, snap, stageBox } from "./helpers";

// L4 visual check for CP-0068: ⌘/Ctrl+C on a selected shape copies the shape;
// ⌘/Ctrl+V pastes it (+16 px) while it is the latest copy; an image copied
// afterwards pastes as an image layer again.

/** Dispatch a paste event carrying whatever the real clipboard holds. */
async function pasteFromClipboard(page: Page) {
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) dt.items.add(new File([await item.getType(type)], "clip.png", { type }));
    }
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
}

function imageLayerCount(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: { find(sel: string): { name(): string }[] } })
      .__capzStage;
    return stage ? stage.find("Image").filter((n) => n.name() !== "bg-image").length : 0;
  });
}

test("Ctrl+C / Ctrl+V copies and pastes the selected shape", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadImage(page);
  await drawRect(page, { x: 60, y: 60 }, { x: 220, y: 180 });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await stageBox(page);
  await page.mouse.click(box.x + 140, box.y + 120);
  await snap(page, "selected");

  const imagesBefore = await imageLayerCount(page);
  await page.keyboard.press("Control+c");
  await expect(page.getByText("Element copied")).toBeVisible();

  await pasteFromClipboard(page);
  await expect.poll(async () => (await rectPositions(page)).length).toBe(2);
  await snap(page, "after-paste-element");
  const [a, b] = await rectPositions(page);
  expect(b.x).toBeGreaterThan(a.x);
  expect(b.y).toBeGreaterThan(a.y);
  expect(await imageLayerCount(page)).toBe(imagesBefore);

  // Something else copied afterwards (a foreign image) wins: image layer.
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 50;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#22cc55";
    ctx.fillRect(0, 0, 50, 40);
    const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  });
  await pasteFromClipboard(page);
  await expect.poll(() => imageLayerCount(page)).toBe(imagesBefore + 1);
  expect(await rectPositions(page)).toHaveLength(2);
  await snap(page, "after-paste-foreign-image");
});
