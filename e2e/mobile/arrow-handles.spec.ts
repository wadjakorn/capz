import { test, expect, type Page } from "@playwright/test";
import { selectArrowTool, oneFingerDrag } from "./gestures";

// Arrows do not use a Konva Transformer — they carry their own Circle handles
// for the tail, curve control and head — so the Transformer `anchorSize` bump
// never reached them and they stayed a 12px target that a fingertip could not
// hit. These tests press the head handle with a finger and assert the endpoint
// actually moved.

async function loadImage(page: Page) {
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
    const file = new File([blob], "shot.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator("canvas").first()).toBeVisible();
}

/** The arrow's head endpoint, read off the live Konva stage in image coords. */
function arrowHead(page: Page) {
  return page.evaluate(() => {
    type Node = { attrs: Record<string, unknown>; name(): string };
    const stage = (window as unknown as { __capzStage?: { find(s: string): Node[] } })
      .__capzStage;
    if (!stage) return null;
    // The arrow's own Konva node carries its points in the annotation's coords.
    const arrow = stage.find("Arrow")[0] as unknown as
      | { points(): number[] }
      | undefined;
    if (!arrow) return null;
    const p = arrow.points();
    return { x: p[p.length - 2], y: p[p.length - 1] };
  });
}

/** Client-space position of a point given in image coords. */
async function toClient(page: Page, x: number, y: number) {
  const box = (await page.locator("canvas").first().boundingBox())!;
  const scale = await page.evaluate(() => {
    const stage = (window as unknown as { __capzStage?: { scaleX(): number } })
      .__capzStage;
    return stage ? stage.scaleX() : 1;
  });
  return { x: box.x + x * scale, y: box.y + y * scale };
}

test("an arrow's head handle can be grabbed and dragged with one finger", async ({
  page,
}) => {
  await loadImage(page);
  await selectArrowTool(page);

  const box = (await page.locator("canvas").first().boundingBox())!;
  // Draw an arrow across the visible canvas.
  await oneFingerDrag(
    page,
    { x: box.x + 30, y: box.y + 40 },
    { x: box.x + 110, y: box.y + 140 },
  );
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();

  const before = await arrowHead(page);
  expect(before, "expected an arrow on the stage").not.toBeNull();

  // Tap the arrow's body to select it, which is what renders the handles.
  const mid = await toClient(
    page,
    (before!.x + 20) / 2,
    (before!.y + 20) / 2,
  );
  await page.touchscreen.tap(mid.x, mid.y);

  // Press OFF-CENTRE from the head handle and drag. The offset is the whole
  // point: CDP dispatches a mathematically exact point, so a dead-centre press
  // hits even a 6px-radius handle and cannot tell the two sizes apart. A real
  // fingertip is an area landing approximately, so the meaningful question is
  // how far off you can be and still grab it. 16px misses the old handle
  // entirely (6px drawn, 6px hit) and is inside the new one (11px drawn, 22px
  // pressable via hitStrokeWidth).
  const head = await toClient(page, before!.x, before!.y);
  const grab = { x: head.x + 16, y: head.y - 4 };
  await oneFingerDrag(page, grab, { x: grab.x - 60, y: grab.y + 30 });

  const after = await arrowHead(page);
  expect(after).not.toBeNull();
  // The head moved, and it moved roughly the way we dragged it.
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20);
});
