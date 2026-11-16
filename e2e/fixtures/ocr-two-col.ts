import type { Page } from "@playwright/test";
import { expect } from "./test";
import { installTauriMock } from "./tauri-mock";

/**
 * CP-0099 harness: /editor with a real 800×600 PNG (two text columns drawn on
 * a canvas) served for asset.localhost, so the OCR layer's image→screen scale
 * is meaningful, and an `ocr_detect` mock returning the matching lines.
 * Image px → screen px via k = layer width / 800. Used by e2e/web/ocr.spec.ts
 * and the L4 visual spec.
 */
export type Pt = { x: number; y: number };

/** The left column's box, in image px. */
export const LEFT = { from: { x: 20, y: 80 }, to: { x: 360, y: 220 } };

export const ocrLayer = (page: Page) => page.locator("[data-ocr-layer]");
export const ocrScopeBox = (page: Page) => page.locator("[data-ocr-scope]");

/**
 * Load the two-column image and run Detect text. With `rescan` (CP-0100) the
 * mock reports OpenThai, and a call with a `region` answers after 800 ms with
 * one more line ("Left three", y 220) that the whole-image scan missed.
 */
export async function setupTwoColOcr(page: Page, opts: { rescan?: boolean } = {}) {
  // The handler is serialised into the page, so it reads this flag from window.
  await page.addInitScript((on) => {
    (window as unknown as { __capzOcrRescan?: boolean }).__capzOcrRescan = on;
  }, !!opts.rescan);
  await installTauriMock(page, {
    handlers: {
      editor_current_image: () => "/tmp/capz-ocr-scope.png",
      ocr_detect: (args: { region?: unknown } | undefined) => {
        const line = (a: string, b: string, x: number, y: number) => ({
          text: a + " " + b,
          bbox: { x, y, w: 200, h: 30 },
          words: [
            { text: a, bbox: { x, y, w: 80, h: 30 } },
            { text: b, bbox: { x: x + 90, y, w: 110, h: 30 } },
          ],
        });
        const lines = [
          line("Left", "one", 40, 100),
          line("Right", "one", 440, 100),
          line("Left", "two", 40, 160),
          line("Right", "two", 440, 160),
        ];
        const res = (ls: unknown[], engine?: string) => ({
          width: 800,
          height: 600,
          lines: ls,
          languagesUsed: ["en"],
          thaiAvailable: true,
          ...(engine ? { engine } : {}),
        });
        if (!(window as unknown as { __capzOcrRescan?: boolean }).__capzOcrRescan) return res(lines);
        if (!args?.region) return res(lines, "openthai");
        return new Promise((resolve) =>
          setTimeout(() => resolve(res([...lines, line("Left", "three", 40, 220)], "openthai")), 800),
        );
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
      ["Left three", 40, 245],
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

export async function toScreen(page: Page, p: Pt): Promise<Pt> {
  const b = (await ocrLayer(page).boundingBox())!;
  const k = b.width / 800;
  return { x: b.x + p.x * k, y: b.y + p.y * k };
}

/** Press at `from`, move in steps, release at `to` (image px). */
export async function dragBox(page: Page, from: Pt, to: Pt) {
  const a = await toScreen(page, from);
  const b = await toScreen(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** The current selection with newlines collapsed (block chips can double them). */
export const selectedText = async (page: Page) =>
  (await page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .replace(/\n+/g, "\n")
    .trim();
