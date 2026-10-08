import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";

/**
 * Visual-check helpers (capz-loop L4). Specs in e2e/visual/ drive the shared
 * Konva editor on /paste — the same editor the desktop app hosts — and save
 * screenshots for a human to look at. scripts/loop/visual-report.mjs turns the
 * output folder into a Markdown report served by md-server.
 *
 * Output goes to $CAPZ_VISUAL_OUT (default e2e/visual-out/, gitignored).
 */
const OUT = process.env.CAPZ_VISUAL_OUT ?? path.join(__dirname, "..", "visual-out");

/** Open /paste and paste a solid 800×600 image so the stage mounts. */
export async function loadImage(page: Page) {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3355ff";
    ctx.fillRect(0, 0, 800, 600);
    const blob: Blob = await new Promise((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
    window.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator("canvas").first()).toBeVisible();
}

export async function stageBox(page: Page) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("stage not mounted");
  return box;
}

/** Drag in small steps — a single jump can miss Konva's drag threshold. */
export async function mouseDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
  await page.mouse.up();
}

/** Draw a rectangle with the Shapes tool, relative to the stage's top-left. */
export async function drawRect(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  const box = await stageBox(page);
  await mouseDrag(page, { x: box.x + from.x, y: box.y + from.y }, { x: box.x + to.x, y: box.y + to.y });
}

/**
 * Save a screenshot as `<NN>-<name>.png`. Call it before and after the
 * behaviour under review so the report reads as a sequence.
 */
let shot = 0;
export async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  shot += 1;
  const file = path.join(OUT, `${String(shot).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/**
 * Annotation rects on the live Konva stage (window.__capzStage, set under
 * NEXT_PUBLIC_TEST=1). Skipped: Transformer handles (also Rects) and the
 * full-image backdrop Rect (as wide as loadImage's 800px image). Only the
 * selected annotation is draggable, so don't filter on that.
 */
export function rectPositions(page: Page) {
  return page.evaluate(() => {
    type Node = {
      x(): number;
      y(): number;
      width(): number;
      getParent(): { className?: string } | null;
    };
    const stage = (window as unknown as { __capzStage?: { find(sel: string): Node[] } })
      .__capzStage;
    if (!stage) return [];
    return stage
      .find("Rect")
      .filter((n) => n.getParent()?.className !== "Transformer" && n.width() < 800)
      .map((n) => ({ x: Math.round(n.x()), y: Math.round(n.y()) }));
  });
}
