import { test, expect, type Page } from "@playwright/test";

// Desktop mouse regression coverage for the pointer-namespace conversion.
//
// The rest of the `web` suite is mount/smoke/IPC and never presses a mouse
// button on the canvas, so it could not have caught a break in the handlers
// this branch moved from `onMouseDown`/`onDblClick` to the pointer namespace.
// These tests drive a real mouse against the real Konva stage.

async function loadImage(page: Page) {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  // A large image so the rendered stage is big enough to drag inside.
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

function stageBox(page: Page) {
  return page.locator("canvas").first().boundingBox();
}

async function mouseDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several moves: a single jump can be coalesced and miss the drag threshold.
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
  await page.mouse.up();
}

test("mouse drag with a shape tool creates an annotation", async ({ page }) => {
  await loadImage(page);
  await expect(page.getByRole("button", { name: /undo/i })).toBeDisabled();

  await page.getByRole("button", { name: "Shapes", exact: true }).click();

  const box = (await stageBox(page))!;
  await mouseDrag(
    page,
    { x: box.x + 60, y: box.y + 60 },
    { x: box.x + 220, y: box.y + 180 },
  );

  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();
});

test("mouse click selects a shape and dragging moves it", async ({ page }) => {
  await loadImage(page);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();

  const box = (await stageBox(page))!;
  await mouseDrag(
    page,
    { x: box.x + 60, y: box.y + 60 },
    { x: box.x + 220, y: box.y + 180 },
  );
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();

  // Read the drawn shape's position off the live Konva stage (exposed as
  // window.__capzStage under NEXT_PUBLIC_TEST=1, which the e2e server sets),
  // so the assertion is about the node actually moving rather than pixels.
  const posOf = () =>
    page.evaluate(() => {
      type Node = { x(): number; y(): number; draggable(): boolean };
      const stage = (
        window as unknown as { __capzStage?: { find(sel: string): Node[] } }
      ).__capzStage;
      if (!stage) return null;
      const node = stage
        .find("Rect")
        .find((n: Node) => typeof n.draggable === "function" && n.draggable());
      return node ? { x: node.x(), y: node.y() } : null;
    });

  const before = await posOf();
  expect(before, "expected a draggable rect on the stage").not.toBeNull();

  // Drag from inside the shape — with the shape tool auto-returning to select,
  // this is a plain move via Konva's draggable.
  await mouseDrag(
    page,
    { x: box.x + 140, y: box.y + 120 },
    { x: box.x + 240, y: box.y + 200 },
  );

  const after = await posOf();
  expect(after!.x).not.toBeCloseTo(before!.x, 0);
});

test("double-clicking a text annotation opens its editor", async ({ page }) => {
  // The highest-risk change on this branch for desktop: TextShape moved from
  // onDblClick (mouse namespace) to onPointerDblClick (pointer namespace).
  // Konva derives the emitted name from the native event type, so a mouse
  // double-click must still reach the handler via its native pointerup.
  await loadImage(page);

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await stageBox(page))!;
  await page.mouse.click(box.x + 120, box.y + 120);

  // Placing text opens the inline editor immediately. Commit with Enter —
  // Escape discards the annotation instead of saving it.
  const editor = page.locator("textarea");
  await expect(editor).toBeVisible();
  await editor.fill("hello");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();

  // Now re-open it by double-clicking the committed text. The glyphs start at
  // the placement point and run right, so click a little into the word.
  await page.mouse.dblclick(box.x + 132, box.y + 130);
  await expect(page.locator("textarea")).toBeVisible();
});

test("ctrl+wheel still zooms the canvas", async ({ page }) => {
  await loadImage(page);

  const zoomPercent = async () => {
    const text = await page.getByText(/\d+\s*%/).first().innerText();
    return Number(text.replace(/[^\d]/g, ""));
  };
  const before = await zoomPercent();

  const box = (await stageBox(page))!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");

  await expect.poll(zoomPercent).toBeGreaterThan(before);
});
