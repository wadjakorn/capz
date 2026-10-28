import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";

// CP-0076: the Shapes tool's rect / ellipse / line draw solid, dashed or dotted.
// Asserts on the live Konva nodes (window.__capzStage under NEXT_PUBLIC_TEST=1),
// so it checks what is actually rendered and exported, not just the panel state.

async function loadImage(page: Page) {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 800, 600);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
    window.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator("canvas").first()).toBeVisible();
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
  await page.mouse.up();
}

/** dash / lineCap of every draggable annotation node, in draw order. */
function strokes(page: Page) {
  return page.evaluate(() => {
    type Node = {
      getClassName(): string;
      draggable(): boolean;
      dash(): number[] | undefined;
      lineCap(): string | undefined;
      stroke(): string;
    };
    const stage = (
      window as unknown as { __capzStage?: { find(sel: (n: Node) => boolean): Node[] } }
    ).__capzStage;
    if (!stage) return null;
    // Rect = rect, Shape = ellipse (custom sceneFunc — a bare Konva.Shape has no
    // `className`, hence getClassName()), Arrow = line. Transformer
    // anchors are draggable Rects too, so match the Shapes default stroke color.
    return stage
      .find((n) => ["Rect", "Shape", "Arrow"].includes(n.getClassName()) && n.stroke?.() === "#ef4444")
      .map((n) => ({ cls: n.getClassName(), dash: n.dash() ?? null, cap: n.lineCap() ?? null }));
  });
}

/** After a draw: Esc to deselect so the next picks set tool defaults, not the
 *  shape. */
async function settle(page: Page) {
  await page.keyboard.press("Escape");
}

async function pick(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

test("Shapes draw solid, dashed and dotted rect / circle / line", async ({ page }) => {
  await loadImage(page);
  const box = (await page.locator("canvas").first().boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });

  await pick(page, "Shapes");
  await pick(page, "Dashed");
  await pick(page, "Rectangle");
  await mouseDrag(page, at(40, 40), at(160, 120));
  await settle(page);

  await pick(page, "Shapes");
  await pick(page, "Dotted");
  await pick(page, "Circle");
  await mouseDrag(page, at(200, 40), at(320, 120));
  await settle(page);

  await pick(page, "Shapes");
  await pick(page, "Line");
  await mouseDrag(page, at(40, 180), at(320, 180));

  await expect.poll(async () => (await strokes(page))?.length).toBe(3);
  const [rect, ellipse, line] = (await strokes(page))!;
  // Default Shapes width is 3 px: dashed = [2sw, 2sw], dotted = [~0, max(2sw, sw+3)].
  expect(rect).toMatchObject({ cls: "Rect", dash: [6, 6], cap: "round" });
  expect(ellipse).toMatchObject({ cls: "Shape", dash: [0.001, 6], cap: "round" });
  expect(line).toMatchObject({ cls: "Arrow", dash: [0.001, 6] });
});

test("a selected shape's line style can be changed and undone", async ({ page }) => {
  await loadImage(page);
  const box = (await page.locator("canvas").first().boundingBox())!;

  await pick(page, "Shapes");
  await pick(page, "Solid");
  await pick(page, "Rectangle");
  await mouseDrag(page, { x: box.x + 60, y: box.y + 60 }, { x: box.x + 220, y: box.y + 180 });
  await expect.poll(async () => (await strokes(page))?.[0]?.dash).toBe(null);

  // Click the outline to select it — the Shapes panel shows the line style.
  await page.mouse.click(box.x + 60, box.y + 120);
  await pick(page, "Dotted");
  await expect.poll(async () => (await strokes(page))?.[0]?.dash).toEqual([0.001, 6]);

  await page.getByRole("button", { name: /undo/i }).click();
  await expect.poll(async () => (await strokes(page))?.[0]?.dash).toBe(null);
});
