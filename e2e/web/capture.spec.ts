import { test, expect } from "@playwright/test";

/**
 * In-browser Screen Capture API path on /paste. getDisplayMedia can't be
 * driven by a real picker in headless CI, so we stub it with a canvas-backed
 * MediaStream via addInitScript, then assert the capture flows into the same
 * Konva editor the paste path uses.
 */
async function stubDisplayMedia(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // A deterministic 800x500 canvas stream stands in for the shared screen.
    (navigator.mediaDevices as MediaDevices).getDisplayMedia = () => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 500;
      const g = c.getContext("2d")!;
      g.fillStyle = "#1e293b";
      g.fillRect(0, 0, 800, 500);
      g.fillStyle = "#38bdf8";
      g.fillRect(60, 60, 300, 180);
      return Promise.resolve(
        (c as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(5),
      );
    };
  });
}

test("Capture screen button mounts the Konva stage from getDisplayMedia", async ({
  page,
}) => {
  await stubDisplayMedia(page);
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  // "Capture screen" appears both in the toolbar and the empty state; the
  // first (toolbar) is enough to exercise the pipeline.
  const btn = page.getByRole("button", { name: /^Capture screen$/i }).first();
  await expect(btn).toBeVisible();
  await btn.click();

  // Same outcome as paste: the shared editor's <canvas> mounts, empty state gone.
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByText(/Capture your screen/i)).toHaveCount(0);
});

test("toolbar Capture screen loads an image and Delete clears it", async ({
  page,
}) => {
  await stubDisplayMedia(page);
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  // Re-capture from the toolbar (works whether or not an image is loaded).
  await page.getByRole("button", { name: "Capture screen" }).first().click();
  await expect(page.locator("canvas").first()).toBeVisible();

  // Bin button enables once an image is present, then clears back to empty.
  const del = page.getByRole("button", { name: "Delete image" });
  await expect(del).toBeEnabled();
  await del.click();
  await expect(page.getByText(/Choose an image/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "No image loaded" })).toBeDisabled();
});

test("Capture screen button is hidden when the Screen Capture API is absent", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Simulate a browser/context without getDisplayMedia (e.g. insecure origin).
    try {
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: undefined,
        configurable: true,
      });
    } catch {
      // mediaDevices itself may be undefined — that's also "unsupported".
    }
  });
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/Choose an image/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Capture screen$/i })).toHaveCount(0);
});
