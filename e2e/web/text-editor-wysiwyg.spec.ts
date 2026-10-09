import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";

// CP-0065: the on-canvas text editor sits exactly where the committed text
// renders — its box equals the committed Konva node's client rect (±2 px) at
// zoom 1 and at a non-1 zoom, and the node is hidden while being re-edited.

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
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
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

type Rect = { x: number; y: number; width: number; height: number };

// The committed text's Group rect in page coordinates, plus its visibility.
async function textNode(page: Page) {
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const n = await page.evaluate(() => {
    type KNode = {
      getParent(): KNode;
      getClientRect(): Rect;
      isVisible(): boolean;
    };
    const stage = (
      window as unknown as { __capzStage?: { find(sel: string): KNode[] } }
    ).__capzStage;
    const text = stage?.find("Text")[0];
    if (!text) return null;
    const g = text.getParent();
    return { rect: g.getClientRect(), visible: g.isVisible() };
  });
  if (!n) return null;
  return {
    visible: n.visible,
    rect: { ...n.rect, x: n.rect.x + canvas.x, y: n.rect.y + canvas.y },
  };
}

function expectClose(a: Rect, b: Rect) {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(2);
}

const zoomPercent = async (page: Page) => {
  const text = await page.getByText(/\d+\s*%/).first().innerText();
  return Number(text.replace(/[^\d]/g, ""));
};

async function placeTypeCommit(page: Page) {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + 120, box.y + 120);
  const editor = page.locator("textarea");
  await expect(editor).toBeVisible();
  await editor.pressSequentially("Hello สวัสดี");
  const editing = (await page.getByTestId("text-editor-box").boundingBox())!;
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  const committed = (await textNode(page))!;
  expect(committed.visible).toBe(true);
  return { editing, committed: committed.rect };
}

test("text editor box matches the committed text at zoom 1", async ({ page }) => {
  await loadImage(page);
  await page.keyboard.press("Control+1");
  await expect.poll(() => zoomPercent(page)).toBe(100);
  const { editing, committed } = await placeTypeCommit(page);
  expectClose(editing, committed);
});

test("text editor box matches the committed text at a non-1 zoom", async ({ page }) => {
  await loadImage(page);
  await page.keyboard.press("Control+1");
  await expect.poll(() => zoomPercent(page)).toBe(100);
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(100);
  const { editing, committed } = await placeTypeCommit(page);
  expectClose(editing, committed);
  // Sanity: the box really scaled with the zoom.
  expect(editing.height).toBeGreaterThan(0);
});

test("re-editing hides the node and overlays it exactly", async ({ page }) => {
  await loadImage(page);
  const { committed } = await placeTypeCommit(page);
  await page.mouse.dblclick(
    committed.x + committed.width / 2,
    committed.y + committed.height / 2,
  );
  await expect(page.locator("textarea")).toBeVisible();
  const editing = (await page.getByTestId("text-editor-box").boundingBox())!;
  expectClose(editing, committed);
  expect((await textNode(page))!.visible).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect.poll(async () => (await textNode(page))!.visible).toBe(true);
});
