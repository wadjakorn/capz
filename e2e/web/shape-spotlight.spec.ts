import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";

// CP-0095: a rect / ellipse can dim the image around it (spotlight). Reads
// rendered pixels off the live Konva stage (window.__capzStage under
// NEXT_PUBLIC_TEST=1), so it checks what is drawn and exported — including
// that the padded backdrop is never dimmed.

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

type Pt = { x: number; y: number };

/** The base image's corners in stage-container CSS px (absolute transform —
 *  getClientRect would include the backdrop shadow). */
function imageBox(page: Page) {
  return page.evaluate(() => {
    type N = { getAbsoluteTransform(): { point(p: Pt): Pt }; width(): number; height(): number };
    type Pt = { x: number; y: number };
    const stage = (window as unknown as { __capzStage?: { findOne(s: string): N | undefined } })
      .__capzStage;
    const img = stage?.findOne(".bg-image");
    if (!img) return null;
    const t = img.getAbsoluteTransform();
    const a = t.point({ x: 0, y: 0 });
    const b = t.point({ x: img.width(), y: img.height() });
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  });
}

/** Red channel of the rendered stage at container-px points. */
function reds(page: Page, pts: Pt[]) {
  return page.evaluate((pts) => {
    const stage = (
      window as unknown as { __capzStage?: { toCanvas(o: object): HTMLCanvasElement } }
    ).__capzStage;
    if (!stage) return null;
    const ctx = stage.toCanvas({ pixelRatio: 1 }).getContext("2d")!;
    return pts.map((p) => ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data[0]);
  }, pts);
}

async function pick(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

const DIM_TOGGLE = "Dim everything around this shape";

test("a dimmed rect darkens the image around it, by level, and undoes", async ({ page }) => {
  await loadImage(page);
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const img = (await imageBox(page))!;
  // Spotlight in the middle third of the image.
  const from = { x: img.x + img.w / 3, y: img.y + img.h / 3 };
  const to = { x: img.x + (2 * img.w) / 3, y: img.y + (2 * img.h) / 3 };
  const inside = { x: img.x + img.w / 2, y: img.y + img.h / 2 };
  const outside = { x: img.x + 12, y: img.y + 12 };

  await pick(page, "Shapes");
  await pick(page, "Rectangle");
  await page.getByRole("button", { name: DIM_TOGGLE }).click();
  await mouseDrag(
    page,
    { x: canvas.x + from.x, y: canvas.y + from.y },
    { x: canvas.x + to.x, y: canvas.y + to.y },
  );

  // Default level = medium (0.55 black over white ≈ 115).
  await expect.poll(async () => (await reds(page, [outside]))?.[0]).toBeLessThan(140);
  const [inMed, outMed] = (await reds(page, [inside, outside]))!;
  expect(inMed).toBe(255);
  expect(outMed).toBeGreaterThan(90);

  // The just-drawn shape is selected: Strong darkens further.
  await pick(page, "Strong");
  await expect.poll(async () => (await reds(page, [outside]))?.[0]).toBeLessThan(outMed - 20);
  expect((await reds(page, [inside]))![0]).toBe(255);

  // Turning dim off clears the overlay; undo brings it back.
  await page.getByRole("button", { name: DIM_TOGGLE }).click();
  await expect.poll(async () => (await reds(page, [outside]))?.[0]).toBe(255);
  await page.getByRole("button", { name: /undo/i }).click();
  await expect.poll(async () => (await reds(page, [outside]))?.[0]).toBeLessThan(140);
});

test("the padded backdrop is never dimmed", async ({ page }) => {
  await loadImage(page);
  await page.getByRole("button", { name: "Show backdrop" }).click();
  await expect.poll(async () => (await imageBox(page))?.x).toBeGreaterThan(20);

  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const img = (await imageBox(page))!;
  const backdrop = { x: img.x - 8, y: img.y + img.h / 2 };
  const outside = { x: img.x + 12, y: img.y + img.h / 2 };
  const [bdBefore] = (await reds(page, [backdrop]))!;

  await pick(page, "Shapes");
  await pick(page, "Circle");
  await page.getByRole("button", { name: DIM_TOGGLE }).click();
  await mouseDrag(
    page,
    { x: canvas.x + img.x + img.w / 3, y: canvas.y + img.y + img.h / 3 },
    { x: canvas.x + img.x + (2 * img.w) / 3, y: canvas.y + img.y + (2 * img.h) / 3 },
  );

  await expect.poll(async () => (await reds(page, [outside]))?.[0]).toBeLessThan(140);
  expect((await reds(page, [backdrop]))![0]).toBe(bdBefore);
});
