import { test, expect } from "@playwright/test";
import { pinch, twoFingerDrag } from "./gestures";

async function loadImage(page: import("@playwright/test").Page) {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  // Load a deterministic 400x300 image through the app's own paste path (a
  // real ClipboardEvent, matching e2e/mobile/draw.spec.ts and
  // e2e/web/paste.spec.ts). A large image is required so the rendered canvas
  // is big enough for the gestures below to land inside it. The
  // `capz:web-paste` custom event (dispatched by the stage's context menu)
  // deliberately ignores its detail and re-reads the system clipboard
  // instead, so it can't be used to inject a fixture image here.
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
}

/** The zoom percentage the toolbar reports, e.g. "125%" → 125. */
async function zoomPercent(page: import("@playwright/test").Page) {
  const text = await page.getByText(/\d+\s*%/).first().innerText();
  return Number(text.replace(/[^\d]/g, ""));
}

// The mobile viewport (Pixel 5, 393px wide) leaves the scrollable canvas
// container only ~150px wide once the toolbar/sidebar take their share — far
// narrower than the 400x300 source image. A touchStart whose point falls
// outside the container's on-screen box never reaches our listeners (it
// lands on a sibling element instead), so every gesture below is anchored on
// the *container's* rect, which stays fixed regardless of zoom, and keeps
// its touchStart separations well inside that rect. Once a touch has
// started inside the container, subsequent touchmoves are still delivered
// to it even if they drift outside the box (implicit pointer capture), so
// only the *starting* separation of each fresh pinch needs to be safe.
async function containerCenter(page: import("@playwright/test").Page) {
  const box = (await page.locator(".overflow-auto").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("pinching apart increases the zoom level", async ({ page }) => {
  await loadImage(page);
  const before = await zoomPercent(page);
  const center = await containerCenter(page);
  await pinch(page, center, 40, 100);
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(before);
});

test("pinching together decreases the zoom level", async ({ page }) => {
  await loadImage(page);
  const center = await containerCenter(page);
  await pinch(page, center, 40, 100);
  const zoomed = await zoomPercent(page);
  await pinch(page, center, 100, 40);
  await expect.poll(() => zoomPercent(page)).toBeLessThan(zoomed);
});

test("two-finger drag pans without changing zoom", async ({ page }) => {
  await loadImage(page);
  const center = await containerCenter(page);
  // Zoom in first so there is somewhere to pan to.
  await pinch(page, center, 40, 110);
  const zoomed = await zoomPercent(page);

  const scrollOf = () =>
    page.evaluate(() => {
      const el = document.querySelector(".overflow-auto") as HTMLElement | null;
      return el ? { left: el.scrollLeft, top: el.scrollTop } : null;
    });
  const before = await scrollOf();

  await twoFingerDrag(
    page,
    [
      { x: center.x - 40, y: center.y },
      { x: center.x + 40, y: center.y },
    ],
    [
      { x: center.x - 140, y: center.y - 80 },
      { x: center.x - 60, y: center.y - 80 },
    ],
  );

  await expect.poll(async () => (await scrollOf())!.left).not.toBe(before!.left);
  expect(await zoomPercent(page)).toBe(zoomed);
});

test("a second finger landing mid-stroke leaves no stray shape", async ({
  page,
}) => {
  await loadImage(page);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  // Anchored on the container (not the canvas): see the comment above
  // containerCenter. Both touchStart points must land inside the ~150px-wide
  // scrollable container on the Pixel 5 viewport, or they land on a sibling
  // element and the second contact is never seen.
  const box = (await page.locator(".overflow-auto").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = (x: number, y: number, id: number) => ({
    x: box.x + x,
    y: box.y + y,
    radiusX: 1,
    radiusY: 1,
    force: 1,
    id,
  });

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [pt(30, 60, 1)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [pt(50, 90, 1)],
  });
  // Second finger arrives → the partial rect must be abandoned.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [pt(50, 90, 1), pt(110, 200, 2)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [pt(40, 70, 1), pt(130, 240, 2)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect(page.getByRole("button", { name: /undo/i })).toBeDisabled();
});
