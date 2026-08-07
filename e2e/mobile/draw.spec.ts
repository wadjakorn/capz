import { test, expect } from "@playwright/test";
import { selectShapesTool } from "./gestures";

test("one-finger drag with the rect tool creates a shape", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  // Load a deterministic 400x300 image through the app's own paste path (a
  // real ClipboardEvent, matching e2e/web/paste.spec.ts). A large image is
  // required so the rendered canvas is big enough for the drag gesture below
  // to land inside it — the 1x1 fixture PNG used by the web suite renders a
  // ~32x32 canvas here, too small for a 100x80 drag. The `capz:web-paste`
  // custom event (dispatched by the stage's context menu) deliberately
  // ignores its detail and re-reads the system clipboard instead, so it
  // can't be used to inject a fixture image here.
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3355ff";
    ctx.fillRect(0, 0, 400, 300);
    const blob: Blob = await new Promise((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    const file = new File([blob], "shot.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  });
  await expect(page.locator("canvas").first()).toBeVisible();

  // The Shapes tool button (id "rect") defaults to the rectangle variant;
  // there is no separate "Rect"/"Rectangle" labeled button in the toolbar.
  await selectShapesTool(page);

  const box = (await page.locator("canvas").first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const at = (dx: number, dy: number) => [
    { x: box.x + dx, y: box.y + dy, radiusX: 1, radiusY: 1, force: 1, id: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(60, 60),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: at(160, 140),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  // The rect tool auto-returns to select and selects the new shape, so an
  // annotation now exists: undo becomes available.
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();
});
