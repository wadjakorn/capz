/**
 * OCR Text Reader — e2e coverage
 *
 * Verifies:
 *  1. "Detect text" button is disabled with no image.
 *  2. After an image loads (via editor:load-image event), the button is enabled.
 *  3. Clicking "Detect text" invokes `ocr_detect` and renders [data-ocr-layer].
 *  4. Re-toggling (off → on) does NOT re-invoke `ocr_detect` (idempotent cache).
 *
 * Harness notes (mirrors editor.spec.ts / editor-tools.spec.ts):
 *  - installTauriMock is called in beforeEach; per-test handler overrides are
 *    passed via opts.handlers so ocr_detect is serialised into the init script.
 *  - __capzInvokeCalls tracks every invoke call, including ocr_detect; we filter
 *    it with getInvokeCalls rather than adding a separate counter.
 *  - The image is loaded by overriding editor_current_image to return a fake path.
 *    The editor page calls invoke("editor_current_image") on mount, which triggers
 *    applyFile → useOcr.getState().setKey(path) → hasImage = true.
 *  - The OcrLayer renders as <div data-ocr-layer> only when mode=true and a
 *    result exists for the current key.
 */
import { test, expect } from "@playwright/test";
import { installTauriMock, getInvokeCalls } from "../fixtures/tauri-mock";

test.describe("OCR Text Reader", () => {
  test("Detect text button is disabled with no image", async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");

    // Without an image, the label says "Detect text (load an image first)"
    const btn = page.getByRole("button", {
      name: /detect text \(load an image first\)/i,
    });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test("OCR overlay renders detected text and re-toggle is idempotent", async ({
    page,
  }) => {
    // Override editor_current_image to return the fake path so the editor
    // loads with hasImage=true and the OCR currentKey is set.
    // NOTE: installTauriMock serialises handlers via .toString() and deserialises
    // via new Function() inside the page, so closures over Node variables like
    // FAKE_PATH and MOCK_OCR_RESULT won't work — the literals must appear
    // directly in the function body.
    await installTauriMock(page, {
      handlers: {
        editor_current_image: () => "/tmp/capz-ocr-test.png",
        ocr_detect: () => ({
          width: 800,
          height: 600,
          lines: [
            {
              text: "Hello world",
              bbox: { x: 10, y: 10, w: 200, h: 30 },
              words: [
                { text: "Hello", bbox: { x: 10, y: 10, w: 90, h: 30 } },
                { text: "world", bbox: { x: 110, y: 10, w: 100, h: 30 } },
              ],
            },
          ],
          languagesUsed: ["en"],
          thaiAvailable: false,
        }),
      },
    });

    // The Tauri mock's convertFileSrc maps file paths to http://asset.localhost/…
    // which doesn't resolve in headless Chrome. Intercept that URL and serve a
    // tiny valid 1×1 PNG so EditorStage's useImage hook successfully loads and
    // the {image && ...} gate (which wraps OcrLayer) opens.
    // Base64 of a 1×1 transparent PNG (68 bytes).
    const TINY_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.route(/asset\.localhost/, (route) =>
      route.fulfill({ body: TINY_PNG, contentType: "image/png" }),
    );

    await page.goto("/editor");
    await page.waitForLoadState("networkidle");

    // --- 1. Button is enabled once an image is loaded ---
    const detectBtn = page.getByRole("button", { name: "Detect text" });
    await expect(detectBtn).toBeVisible();
    await expect(detectBtn).toBeEnabled();

    // --- 2. Click "Detect text" → ocr_detect fires, overlay appears ---
    await detectBtn.click();

    // Button label transitions to "Detecting text…" (status=scanning) then
    // "Hide detected text" (mode=true, status=done). Wait for the final label.
    const hideBtn = page.getByRole("button", { name: "Hide detected text" });
    await expect(hideBtn).toBeVisible({ timeout: 5000 });

    const layer = page.locator("[data-ocr-layer]");
    await expect(layer).toBeVisible();
    await expect(layer).toContainText("Hello");

    // Exactly one ocr_detect call at this point.
    const callsAfterFirst = await getInvokeCalls(page);
    const detectCount1 = callsAfterFirst.filter(
      (c) => c.cmd === "ocr_detect",
    ).length;
    expect(detectCount1).toBe(1);

    // --- 3. Toggle off → overlay disappears ---
    await hideBtn.click();
    await expect(layer).not.toBeVisible();

    // --- 4. Toggle on again → overlay reappears, no new ocr_detect call ---
    await expect(detectBtn).toBeVisible();
    await detectBtn.click();
    await expect(hideBtn).toBeVisible({ timeout: 5000 });
    await expect(layer).toBeVisible();
    await expect(layer).toContainText("Hello");

    const callsAfterSecond = await getInvokeCalls(page);
    const detectCount2 = callsAfterSecond.filter(
      (c) => c.cmd === "ocr_detect",
    ).length;
    // Must still be exactly 1 — cache hit, no second network round-trip.
    expect(detectCount2).toBe(1);
  });

  test.fixme(
    "OCR word selection → Cmd+C copies plain text to clipboard (manual, requires native selection API)",
    async () => {
      // Native text selection + Clipboard API cannot be reliably automated in
      // headless Chromium. Verify manually per docs/manual-qa.md step 10.6.
    },
  );
});
