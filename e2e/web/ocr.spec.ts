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
 * CP-0099 — drag a box in OCR mode to keep only that area's text.
 *
 * Harness: a real 800×600 PNG (two text columns drawn on a canvas) is served
 * for asset.localhost so the layer's image→screen scale is meaningful; the
 * mock returns the matching TWO_COL lines. Image px → screen px via
 * k = layer width / 800. Selections are compared after collapsing newlines —
 * block-level chips plus each chip's literal "\n" can double them.
 */
test.describe("OCR area scope (CP-0099)", () => {
  type Pt = { x: number; y: number };

  async function setup(page: Page) {
    await installTauriMock(page, {
      handlers: {
        editor_current_image: () => "/tmp/capz-ocr-scope.png",
        ocr_detect: () => {
          const line = (a: string, b: string, x: number, y: number) => ({
            text: a + " " + b,
            bbox: { x, y, w: 200, h: 30 },
            words: [
              { text: a, bbox: { x, y, w: 80, h: 30 } },
              { text: b, bbox: { x: x + 90, y, w: 110, h: 30 } },
            ],
          });
          return {
            width: 800,
            height: 600,
            lines: [
              line("Left", "one", 40, 100),
              line("Right", "one", 440, 100),
              line("Left", "two", 40, 160),
              line("Right", "two", 440, 160),
            ],
            languagesUsed: ["en"],
            thaiAvailable: true,
          };
        },
      },
    });
    // Draw the PNG on a scratch page: the fixture's goto() waits for the app's
    // <html lang="en">, which about:blank never gets.
    const scratch = await page.context().newPage();
    const b64 = await scratch.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 600;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 800, 600);
      g.fillStyle = "#111111";
      g.font = "24px sans-serif";
      for (const [t, x, y] of [
        ["Left one", 40, 125],
        ["Right one", 440, 125],
        ["Left two", 40, 185],
        ["Right two", 440, 185],
      ] as const) {
        g.fillText(t, x, y);
      }
      return c.toDataURL("image/png").split(",")[1];
    });
    await scratch.close();
    const png = Buffer.from(b64, "base64");
    // CORS header: the stage image loads crossOrigin="anonymous", and an
    // untainted canvas lets a (wrong) whole-image copy actually reach the
    // clipboard mock — which the ⌘C test checks never happens.
    await page.route(/asset\.localhost/, (route) =>
      route.fulfill({
        body: png,
        contentType: "image/png",
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Detect text" }).click();
    await expect(page.getByRole("button", { name: "Hide detected text" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("[data-ocr-layer]")).toContainText("Right one");
  }

  async function toScreen(page: Page, p: Pt): Promise<Pt> {
    const b = (await page.locator("[data-ocr-layer]").boundingBox())!;
    const k = b.width / 800;
    return { x: b.x + p.x * k, y: b.y + p.y * k };
  }

  async function drag(page: Page, from: Pt, to: Pt) {
    const a = await toScreen(page, from);
    const b = await toScreen(page, to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
  }

  async function click(page: Page, p: Pt) {
    const s = await toScreen(page, p);
    await page.mouse.click(s.x, s.y);
  }

  const selected = async (page: Page) =>
    (await page.evaluate(() => window.getSelection()?.toString() ?? ""))
      .replace(/\n+/g, "\n")
      .trim();

  const LEFT = { from: { x: 20, y: 80 }, to: { x: 360, y: 220 } };
  const layer = (page: Page) => page.locator("[data-ocr-layer]");
  const scopeBox = (page: Page) => page.locator("[data-ocr-scope]");

  test("drag a box: only that area's text shows and is pre-selected; ⌘A stays inside; no re-scan", async ({
    page,
  }) => {
    await setup(page);
    await drag(page, LEFT.from, LEFT.to);
    await expect(scopeBox(page)).toBeVisible();
    await expect(layer(page)).toContainText("Left one");
    await expect(layer(page)).not.toContainText("Right one");
    expect(await selected(page)).toBe("Left one\nLeft two");
    await page.keyboard.press("ControlOrMeta+a");
    expect(await selected(page)).toBe("Left one\nLeft two");
    const calls = await getInvokeCalls(page);
    expect(calls.filter((c) => c.cmd === "ocr_detect")).toHaveLength(1);
  });

  test("Esc and a click outside the box bring back the whole-image text", async ({ page }) => {
    await setup(page);
    await drag(page, LEFT.from, LEFT.to);
    await expect(scopeBox(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(scopeBox(page)).toHaveCount(0);
    await expect(layer(page)).toContainText("Right one");

    await drag(page, LEFT.from, LEFT.to);
    await expect(scopeBox(page)).toBeVisible();
    await click(page, { x: 300, y: 140 }); // inside the box, off any chip
    await expect(scopeBox(page)).toBeVisible();
    await click(page, { x: 600, y: 400 }); // outside
    await expect(scopeBox(page)).toHaveCount(0);
    await expect(layer(page)).toContainText("Right one");
  });

  test("a second box replaces the first", async ({ page }) => {
    await setup(page);
    await drag(page, LEFT.from, LEFT.to);
    await expect(layer(page)).not.toContainText("Right one");
    await drag(page, { x: 420, y: 80 }, { x: 780, y: 220 });
    await expect(layer(page)).toContainText("Right one");
    await expect(layer(page)).not.toContainText("Left one");
    expect(await selected(page)).toBe("Right one\nRight two");
  });

  test("a tiny drag acts as a click; double-click still selects a word", async ({ page }) => {
    await setup(page);
    // No scope: a tiny drag does nothing.
    const a = await toScreen(page, { x: 600, y: 400 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 3, a.y, { steps: 3 });
    await expect(page.locator("[data-ocr-scope-draft]")).toHaveCount(0);
    await page.mouse.up();
    await expect(scopeBox(page)).toHaveCount(0);

    // With a scope: a tiny drag outside it clears it, like a click.
    await drag(page, LEFT.from, LEFT.to);
    await expect(scopeBox(page)).toBeVisible();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 3, a.y, { steps: 3 });
    await page.mouse.up();
    await expect(scopeBox(page)).toHaveCount(0);

    // Double-click stays native: it selects a word on a chip.
    const w = await toScreen(page, { x: 465, y: 115 }); // inside "Right"
    await page.mouse.dblclick(w.x, w.y);
    expect(await selected(page)).toContain("Right");
  });

  test("⌘C never copies the image while scoped", async ({ page }) => {
    await setup(page);
    const copiedToast = page.getByText("Copied", { exact: true });
    const imageCopies = async () =>
      (await getInvokeCalls(page)).filter((c) => c.cmd === "plugin:clipboard-manager|write_image")
        .length;

    // (a) The selection was lost: ⌘C re-selects the scope text first.
    await drag(page, LEFT.from, LEFT.to);
    await expect(scopeBox(page)).toBeVisible();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.keyboard.press("ControlOrMeta+c");
    expect(await selected(page)).toBe("Left one\nLeft two");
    await page.waitForTimeout(300);
    await expect(copiedToast).toHaveCount(0);
    expect(await imageCopies()).toBe(0);

    // (b) An empty scope copies nothing — and never the image.
    await drag(page, { x: 600, y: 400 }, { x: 780, y: 580 });
    await expect(page.getByText("No text found")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+c");
    await page.waitForTimeout(300);
    await expect(copiedToast).toHaveCount(0);
    expect(await imageCopies()).toBe(0);
    await expect(layer(page)).toBeVisible();
  });

  test("a move with no button held ends the drag", async ({ page }) => {
    await setup(page);
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
    await expect(scopeBox(page)).toBeVisible();
    await expect(layer(page)).not.toContainText("Right one");
    await page.mouse.move(b.x + 40, b.y + 40, { steps: 3 });
    await expect(page.locator("[data-ocr-scope-draft]")).toHaveCount(0);
    await page.mouse.up();
  });

  test("release outside the image clamps the box", async ({ page }) => {
    await setup(page);
    const lb = (await layer(page).boundingBox())!;
    const a = await toScreen(page, { x: 700, y: 500 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width + 20, lb.y + lb.height + 20, { steps: 5 });
    await page.mouse.up();
    await expect(scopeBox(page)).toBeVisible();
    const sb = (await scopeBox(page).boundingBox())!;
    expect(Math.abs(sb.x + sb.width - (lb.x + lb.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(sb.y + sb.height - (lb.y + lb.height))).toBeLessThanOrEqual(1);
  });

  test("zoom keeps the box aligned", async ({ page }) => {
    await setup(page);
    await drag(page, LEFT.from, LEFT.to);
    await expect(scopeBox(page)).toBeVisible();
    const ratios = async () => {
      const l = (await layer(page).boundingBox())!;
      const s = (await scopeBox(page).boundingBox())!;
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
});
