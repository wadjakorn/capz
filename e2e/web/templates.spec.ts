/**
 * Editor templates (spec 2026-10-16 §8) — Tier-1 e2e under mocked IPC.
 *
 * Harness notes:
 *  - The Templates tab is desktop-only, so the Tauri mock is required.
 *  - Workspaces are switched on by seeding the config store ("app" key) in an
 *    init script registered after installTauriMock (which creates the bag).
 *    `templates` is seeded empty so the corrupt-file guard stays quiet (the
 *    mock's fs|exists is always true).
 *  - Two image sizes are served from one asset route that branches on the
 *    file name: a.png is 1000×800, b.png 600×400 (SVG with explicit size).
 *  - Images arrive via `editor:load-image`; onCapture "new" puts each in its
 *    own workspace. The file-save path is never touched (nextFreePath would
 *    loop forever against the always-true fs|exists).
 *  - Positions are read off the live Konva stage (window.__capzStage).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { installTauriMock, emitTauriEvent } from "../fixtures/tauri-mock";
import { mouseDrag } from "../visual/helpers";

const A = "/tmp/capz-tpl/a.png";
const B = "/tmp/capz-tpl/b.png";

async function setup(page: Page) {
  await installTauriMock(page);
  await page.addInitScript(() => {
    const bag = (window as unknown as { __capzStoreData: Map<string, unknown> }).__capzStoreData;
    // Partial on purpose: validateConfig fills every other section from
    // DEFAULT_CONFIG (e2e can't import src/ — no "@/" path alias here).
    bag.set("app", {
      schemaVersion: 6,
      workspaces: { enabled: true, max: 5, onCapture: "new" },
    });
    bag.set("templates", []);
  });
  await page.route(/asset\.localhost/, (route) => {
    const url = decodeURIComponent(route.request().url());
    const [w, h, fill] = /b\.png/.test(url) ? [600, 400, "#33aa55"] : [1000, 800, "#3355ff"];
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`,
    });
  });
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
}

/** Base image size on the stage (natural px), or null before it decodes. */
function stageImage(page: Page) {
  return page.evaluate(() => {
    type N = { width(): number; height(): number };
    const s = (window as unknown as { __capzStage?: { findOne(sel: string): N | undefined } })
      .__capzStage;
    const img = s?.findOne(".bg-image");
    return img ? { w: Math.round(img.width()), h: Math.round(img.height()) } : null;
  });
}

async function load(page: Page, path: string, size: { w: number; h: number }) {
  await expect
    .poll(() => emitTauriEvent(page, "editor:load-image", { path, source: "area" }))
    .toBeGreaterThan(0);
  await expect.poll(() => stageImage(page)).toEqual(size);
}

/**
 * Stroked annotation rects (Shapes tool) in image coords. Excludes Transformer
 * handles and the unstroked backdrop/canvas fills.
 */
function rects(page: Page) {
  return page.evaluate(() => {
    type N = {
      x(): number;
      y(): number;
      width(): number;
      height(): number;
      stroke(): string | undefined;
      getParent(): { className?: string } | null;
      getClassName(): string;
    };
    const s = (window as unknown as { __capzStage?: { find(sel: string): N[] } }).__capzStage;
    if (!s) return [];
    return s
      .find("Rect")
      .filter((n) => n.getParent()?.className !== "Transformer" && !!n.stroke())
      .map((n) => ({ x: Math.round(n.x()), y: Math.round(n.y()) }));
  });
}

/** Blur annotations render as Konva nodes carrying a filter. */
function blurCount(page: Page) {
  return page.evaluate(() => {
    type N = { getClassName(): string; filters?: () => unknown[] | undefined };
    const s = (window as unknown as { __capzStage?: { find(sel: (n: N) => boolean): N[] } })
      .__capzStage;
    if (!s) return 0;
    return s.find((n) => (n.filters?.() ?? []).length > 0).length;
  });
}

async function canvasBox(page: Page) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("stage not mounted");
  return box;
}

/** Pick a tool, then drag relative to the stage's top-left. */
async function drawWith(page: Page, tool: "Shapes" | "Blur", from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const b = await canvasBox(page);
  await mouseDrag(page, { x: b.x + from[0], y: b.y + from[1] }, { x: b.x + to[0], y: b.y + to[1] });
}

async function selectTool(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select", exact: true }).click();
}

async function openTemplates(page: Page) {
  await page.getByRole("tab", { name: "Templates" }).click();
  await expect(page.locator("#sidebar-panel-templates")).toBeVisible();
}

/** Save a template from the active image; `exclude` unchecks matching items. */
async function saveTemplate(page: Page, exclude?: RegExp) {
  await openTemplates(page);
  await page.getByRole("button", { name: "Save as template" }).first().click();
  const popup = page.getByRole("dialog");
  await expect(popup.getByRole("tree")).toBeVisible();
  if (exclude) {
    const box = popup.getByRole("checkbox", { name: exclude });
    await box.uncheck();
  }
  await popup.getByRole("button", { name: "Save as template" }).click();
  await expect(page.locator("[data-template-card]")).toHaveCount(1);
}

const tile = (page: Page, i: number) => page.locator("[data-ws-tile]").nth(i);

async function switchTo(page: Page, i: number, size: { w: number; h: number }) {
  await tile(page, i).click();
  await expect.poll(() => stageImage(page)).toEqual(size);
}

/** Press on the card's thumbnail (not a button) and drag to a point. */
async function dragCardTo(page: Page, to: { x: number; y: number }) {
  const thumb = page.locator("[data-template-card] img").first();
  const b = await thumb.boundingBox();
  if (!b) throw new Error("no card");
  await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, to);
}

async function center(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no ${selector}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const SIZE_A = { w: 1000, h: 800 };
const SIZE_B = { w: 600, h: 400 };

test.describe("editor templates", () => {
  // Each test loads two images and drives several popovers against `next dev`;
  // ~20 s warm with 5 workers, more while the dev server compiles /editor.
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test("rect-only template dropped on another workspace lands at the same position", async ({
    page,
  }) => {
    await load(page, A, SIZE_A);
    await drawWith(page, "Shapes", [40, 40], [120, 100]);
    await drawWith(page, "Blur", [160, 40], [240, 100]);
    await selectTool(page);
    const onA = await rects(page);
    expect(onA).toHaveLength(1);
    expect(await blurCount(page)).toBeGreaterThan(0);

    await saveTemplate(page, /^Blur/);

    await load(page, B, SIZE_B);
    expect(await rects(page)).toHaveLength(0);
    await dragCardTo(page, await center(page, "#canvas-area"));

    await expect.poll(() => rects(page)).toEqual(onA);
    expect(await blurCount(page)).toBe(0);
  });

  test("one Ctrl+Z removes the applied items", async ({ page }) => {
    await load(page, A, SIZE_A);
    await drawWith(page, "Shapes", [40, 40], [120, 100]);
    await selectTool(page);
    await saveTemplate(page);

    await load(page, B, SIZE_B);
    await dragCardTo(page, await center(page, "#canvas-area"));
    await expect.poll(async () => (await rects(page)).length).toBe(1);

    await selectTool(page);
    await page.locator("#canvas-area").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await rects(page)).length).toBe(0);
  });

  test("apply-to multiple workspaces", async ({ page }) => {
    await load(page, A, SIZE_A);
    await drawWith(page, "Shapes", [40, 40], [120, 100]);
    await selectTool(page);
    await saveTemplate(page);

    await load(page, B, SIZE_B);
    await page.getByRole("button", { name: "Apply to…" }).click();
    const popup = page.getByRole("dialog");
    // The active workspace (2) is pre-checked; add workspace 1.
    await expect(popup.getByRole("checkbox", { name: "2", exact: true })).toBeChecked();
    await popup.getByRole("checkbox", { name: "1", exact: true }).check();
    await popup.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(popup).toBeHidden();

    await expect.poll(async () => (await rects(page)).length).toBe(1);
    await switchTo(page, 0, SIZE_A);
    // A had its own rect; the template's copy lands on top of it.
    await expect.poll(async () => (await rects(page)).length).toBe(2);
  });

  test("apply this image's edits to B without saving", async ({ page }) => {
    await load(page, A, SIZE_A);
    await load(page, B, SIZE_B);
    await switchTo(page, 0, SIZE_A);
    await drawWith(page, "Shapes", [40, 40], [120, 100]);
    await selectTool(page);
    const onA = await rects(page);

    await openTemplates(page);
    await page.getByRole("button", { name: "Apply this image's edits to…" }).click();
    const popup = page.getByRole("dialog");
    await popup.getByRole("checkbox", { name: "2", exact: true }).check();
    await popup.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(popup).toBeHidden();

    // Nothing was saved as a template.
    await expect(page.locator("[data-template-card]")).toHaveCount(0);
    await switchTo(page, 1, SIZE_B);
    await expect.poll(() => rects(page)).toEqual(onA);
  });

  test("tile drop applies without switching", async ({ page }) => {
    await load(page, A, SIZE_A);
    await drawWith(page, "Shapes", [40, 40], [120, 100]);
    await selectTool(page);
    const onA = await rects(page);
    await saveTemplate(page);
    await load(page, B, SIZE_B);
    await switchTo(page, 0, SIZE_A);

    const bTile = tile(page, 1);
    const tb = await bTile.boundingBox();
    if (!tb) throw new Error("no tile");
    await dragCardTo(page, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 });

    // B's tile flashes green; the editor stays on A with A's single rect.
    await expect(bTile).toHaveClass(/ring-\[var\(--success/);
    expect(await stageImage(page)).toEqual(SIZE_A);
    expect(await rects(page)).toEqual(onA);

    await switchTo(page, 1, SIZE_B);
    await expect.poll(() => rects(page)).toEqual(onA);
  });
});
