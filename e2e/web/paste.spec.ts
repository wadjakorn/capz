import { test, expect } from "@playwright/test";

// 1x1 red PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function pasteImage(page: import("@playwright/test").Page) {
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "shot.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  }, PNG_B64);
}

test("paste page shows the web empty state without desktop-only chrome", async ({
  page,
}) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/Paste a screenshot/i)).toBeVisible();
  await expect(page.getByText(/Choose an image/i)).toBeVisible();

  // Desktop-only toolbar chrome must be hidden on the web build. The web
  // build's own "Capture screen" button (empty state) is intentionally allowed.
  await expect(
    page.getByRole("button", { name: /^Capture (full screen|area|window|options)$/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^settings$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /detect text/i })).toHaveCount(0);

  // Shared editor chrome is still there.
  await expect(page.getByRole("button", { name: /undo/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /copy/i }).first()).toBeVisible();
});

test("pasting an image mounts the Konva stage", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  await pasteImage(page);

  // Konva renders <canvas> inside the stage container.
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByText(/Paste a screenshot/i)).toHaveCount(0);
});

test("copy toolbar button writes a PNG to the clipboard", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  await pasteImage(page);
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.getByRole("button", { name: /^copy$/i }).click();
  await expect(page.getByText(/^Copied$/)).toBeVisible();

  const hasImage = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.some((i) => i.types.includes("image/png"));
  });
  expect(hasImage).toBe(true);
});

test("choosing a file via the picker mounts the stage", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  const bytes = Buffer.from(PNG_B64, "base64");
  // Target the labeled picker specifically — the page also has a second hidden
  // file input for the "Import image" action, so a bare input[type=file]
  // locator is ambiguous (strict-mode violation).
  await page.getByLabel("Choose an image…").setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: bytes,
  });

  await expect(page.locator("canvas").first()).toBeVisible();
});
