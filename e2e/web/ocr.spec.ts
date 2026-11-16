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
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { installTauriMock, getInvokeCalls } from "../fixtures/tauri-mock";
import {
  LEFT,
  dragBox,
  ocrLayer,
  ocrScopeBox,
  selectedText,
  setupTwoColOcr,
  toScreen,
  type Pt,
} from "../fixtures/ocr-two-col";

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

    // --- 2a. Line-level chip count: mock returns exactly one line → one <span> ---
    await expect(page.locator("[data-ocr-layer] > span")).toHaveCount(1);

    // --- 2b. Select-all: ⌘/Ctrl+A on the overlay selects all OCR text ---
    // Click the overlay to ensure the page has focus before firing the shortcut.
    await page.locator("[data-ocr-layer]").click();
    await page.keyboard.press("ControlOrMeta+a");
    const selected = await page.evaluate(
      () => window.getSelection()?.toString() ?? "",
    );
    expect(selected).toContain("Hello");

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

/**
 * CP-0099 — drag a box in OCR mode to keep only that area's text. Harness in
 * e2e/fixtures/ocr-two-col.ts.
 */
test.describe("OCR area scope (CP-0099)", () => {
  async function click(page: Page, p: Pt) {
    const s = await toScreen(page, p);
    await page.mouse.click(s.x, s.y);
  }

  test("drag a box: only that area's text shows and is pre-selected; ⌘A stays inside; no re-scan", async ({
    page,
  }) => {
    await setupTwoColOcr(page);
    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrScopeBox(page)).toBeVisible();
    await expect(ocrLayer(page)).toContainText("Left one");
    await expect(ocrLayer(page)).not.toContainText("Right one");
    expect(await selectedText(page)).toBe("Left one\nLeft two");
    await page.keyboard.press("ControlOrMeta+a");
    expect(await selectedText(page)).toBe("Left one\nLeft two");
    const calls = await getInvokeCalls(page);
    expect(calls.filter((c) => c.cmd === "ocr_detect")).toHaveLength(1);
  });

  test("Esc and a click outside the box bring back the whole-image text", async ({ page }) => {
    await setupTwoColOcr(page);
    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrScopeBox(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ocrScopeBox(page)).toHaveCount(0);
    await expect(ocrLayer(page)).toContainText("Right one");

    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrScopeBox(page)).toBeVisible();
    await click(page, { x: 300, y: 140 }); // inside the box, off any chip
    await expect(ocrScopeBox(page)).toBeVisible();
    await click(page, { x: 600, y: 400 }); // outside
    await expect(ocrScopeBox(page)).toHaveCount(0);
    await expect(ocrLayer(page)).toContainText("Right one");
  });

  test("a second box replaces the first", async ({ page }) => {
    await setupTwoColOcr(page);
    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrLayer(page)).not.toContainText("Right one");
    await dragBox(page, { x: 420, y: 80 }, { x: 780, y: 220 });
    await expect(ocrLayer(page)).toContainText("Right one");
    await expect(ocrLayer(page)).not.toContainText("Left one");
    expect(await selectedText(page)).toBe("Right one\nRight two");
  });

  test("a tiny drag acts as a click; double-click still selects a word", async ({ page }) => {
    await setupTwoColOcr(page);
    // No scope: a tiny drag does nothing.
    const a = await toScreen(page, { x: 600, y: 400 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 3, a.y, { steps: 3 });
    await expect(page.locator("[data-ocr-scope-draft]")).toHaveCount(0);
    await page.mouse.up();
    await expect(ocrScopeBox(page)).toHaveCount(0);

    // With a scope: a tiny drag outside it clears it, like a click.
    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrScopeBox(page)).toBeVisible();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 3, a.y, { steps: 3 });
    await page.mouse.up();
    await expect(ocrScopeBox(page)).toHaveCount(0);

    // Double-click stays native: it selects a word on a chip.
    const w = await toScreen(page, { x: 465, y: 115 }); // inside "Right"
    await page.mouse.dblclick(w.x, w.y);
    expect(await selectedText(page)).toContain("Right");
  });

  test("⌘C never copies the image while scoped", async ({ page }) => {
    await setupTwoColOcr(page);
    const copiedToast = page.getByText("Copied", { exact: true });
    const imageCopies = async () =>
      (await getInvokeCalls(page)).filter((c) => c.cmd === "plugin:clipboard-manager|write_image")
        .length;

    // (a) The selection was lost: ⌘C re-selects the scope text first.
    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrScopeBox(page)).toBeVisible();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.keyboard.press("ControlOrMeta+c");
    expect(await selectedText(page)).toBe("Left one\nLeft two");
    await page.waitForTimeout(300);
    await expect(copiedToast).toHaveCount(0);
    expect(await imageCopies()).toBe(0);

    // (b) An empty scope copies nothing — and never the image.
    await dragBox(page, { x: 600, y: 400 }, { x: 780, y: 580 });
    await expect(page.getByText("No text found")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+c");
    await page.waitForTimeout(300);
    await expect(copiedToast).toHaveCount(0);
    expect(await imageCopies()).toBe(0);
    await expect(ocrLayer(page)).toBeVisible();
  });

  test("a move with no button held ends the drag", async ({ page }) => {
    await setupTwoColOcr(page);
    const a = await toScreen(page, LEFT.from);
    const b = await toScreen(page, { x: 200, y: 200 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await expect(page.locator("[data-ocr-scope-draft]")).toBeVisible();
    // The mouseup went elsewhere (app switch, native menu): the next move has
    // no button held.
    await page.evaluate(
      ([x, y]) =>
        window.dispatchEvent(
          new MouseEvent("mousemove", { clientX: x, clientY: y, buttons: 0, bubbles: true }),
        ),
      [b.x, b.y],
    );
    await expect(page.locator("[data-ocr-scope-draft]")).toHaveCount(0);
    await expect(ocrScopeBox(page)).toBeVisible();
    await expect(ocrLayer(page)).not.toContainText("Right one");
    await page.mouse.move(b.x + 40, b.y + 40, { steps: 3 });
    await expect(page.locator("[data-ocr-scope-draft]")).toHaveCount(0);
    await page.mouse.up();
  });

  test("release outside the image clamps the box", async ({ page }) => {
    await setupTwoColOcr(page);
    const lb = (await ocrLayer(page).boundingBox())!;
    const a = await toScreen(page, { x: 700, y: 500 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width + 20, lb.y + lb.height + 20, { steps: 5 });
    await page.mouse.up();
    await expect(ocrScopeBox(page)).toBeVisible();
    const sb = (await ocrScopeBox(page).boundingBox())!;
    expect(Math.abs(sb.x + sb.width - (lb.x + lb.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(sb.y + sb.height - (lb.y + lb.height))).toBeLessThanOrEqual(1);
  });

  test("zoom keeps the box aligned", async ({ page }) => {
    await setupTwoColOcr(page);
    await dragBox(page, LEFT.from, LEFT.to);
    await expect(ocrScopeBox(page)).toBeVisible();
    const ratios = async () => {
      const l = (await ocrLayer(page).boundingBox())!;
      const s = (await ocrScopeBox(page).boundingBox())!;
      return {
        w: l.width,
        x: (s.x - l.x) / l.width,
        y: (s.y - l.y) / l.height,
        r: (s.x + s.width - l.x) / l.width,
        b: (s.y + s.height - l.y) / l.height,
      };
    };
    const before = await ratios();
    await page.keyboard.press("ControlOrMeta+Equal");
    await expect.poll(async () => (await ratios()).w).not.toBe(before.w);
    const after = await ratios();
    for (const k of ["x", "y", "r", "b"] as const) {
      expect(Math.abs(after[k] - before[k])).toBeLessThan(0.01);
    }
  });

  test("in the Settings view, ⌘A leaves the hidden OCR text alone", async ({ page }) => {
    await setupTwoColOcr(page);
    await dragBox(page, LEFT.from, LEFT.to);
    expect(await selectedText(page)).toBe("Left one\nLeft two");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByTitle("Back to editor")).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+a");
    expect(await selectedText(page)).not.toBe("Left one\nLeft two");
    await page.getByTitle("Back to editor").click();
    await expect(ocrScopeBox(page)).toBeVisible(); // the scope survives the trip
  });
});

/** CP-0100 — an OpenThai box is re-scanned; missed lines join the scope. */
test.describe("OCR scope re-scan (CP-0100)", () => {
  const BOX = { from: { x: 20, y: 80 }, to: { x: 360, y: 280 } };
  const busy = (page: Page) => page.locator("[data-ocr-scope-busy]");

  test("spinner, then the line the whole image missed appears and is selected", async ({ page }) => {
    await setupTwoColOcr(page, { rescan: true });
    await expect(ocrLayer(page)).not.toContainText("Left three");
    await dragBox(page, BOX.from, BOX.to);
    await expect(busy(page)).toBeVisible();
    expect(await selectedText(page)).toBe("Left one\nLeft two"); // instant filter
    await expect(ocrLayer(page)).toContainText("Left three");
    await expect(busy(page)).toHaveCount(0);
    expect(await selectedText(page)).toBe("Left one\nLeft two\nLeft three");
    const calls = (await getInvokeCalls(page)).filter((c) => c.cmd === "ocr_detect");
    expect(calls).toHaveLength(2);
    // Padded box: pad = max(32, 10% of 340) = 34, clamped to the image.
    // (screen → image px rounding: ±2 px).
    const region = (calls[1].args as { region: Record<"x" | "y" | "w" | "h", number> }).region;
    const want = { x: 0, y: 46, w: 394, h: 268 };
    for (const k of ["x", "y", "w", "h"] as const) {
      expect(Math.abs(region[k] - want[k])).toBeLessThanOrEqual(2);
    }
  });

  test("a selection made during the re-scan is left alone", async ({ page }) => {
    await setupTwoColOcr(page, { rescan: true });
    await dragBox(page, BOX.from, BOX.to);
    await expect(busy(page)).toBeVisible();
    const w = await toScreen(page, { x: 70, y: 115 }); // the word "Left"
    await page.mouse.dblclick(w.x, w.y);
    expect(await selectedText(page)).toBe("Left");
    await expect(ocrLayer(page)).toContainText("Left three");
    expect(await selectedText(page)).toBe("Left");
  });

  test("Esc during the re-scan discards its result", async ({ page }) => {
    await setupTwoColOcr(page, { rescan: true });
    await dragBox(page, BOX.from, BOX.to);
    await expect(busy(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ocrScopeBox(page)).toHaveCount(0);
    await page.waitForTimeout(1200);
    await expect(ocrLayer(page)).toContainText("Right one");
    await expect(ocrLayer(page)).not.toContainText("Left three");
  });
});
