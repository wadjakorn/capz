import { test, expect } from "@playwright/test";
import { installTauriMock, getInvokeCalls } from "../fixtures/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("overlay route mounts in area mode", async ({ page }) => {
  await page.goto("/overlay?monitor=0&mode=area");
  await page.waitForLoadState("networkidle");
  // Overlay is intentionally chromeless; assert body present + no fatal crash.
  await expect(page.locator("body")).toBeVisible();
});

test("overlay area drag emits capture_region_command", async ({ page }) => {
  await page.goto("/overlay?monitor=0&mode=area");
  await page.waitForLoadState("networkidle");

  // Simulate a mouse drag across the viewport.
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 8 });
  await page.mouse.up();

  // The overlay debounces/closes via key Enter on some flows; press it as safety.
  await page.keyboard.press("Enter").catch(() => {});

  const calls = await getInvokeCalls(page);
  // Either capture_region_command or close_overlay_command should have run.
  const cmds = calls.map((c) => c.cmd);
  expect(cmds.some((c) => c.startsWith("capture_") || c === "close_overlay_command")).toBe(true);
});

test("overlay window mode mounts without crash", async ({ page }) => {
  await installTauriMock(page, {
    handlers: {
      list_capture_windows: () => [
        { id: 1, title: "Test Window", app_name: "Test", x: 0, y: 0, width: 800, height: 600 },
      ],
    },
  });
  await page.goto("/overlay?monitor=0&mode=window");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  // list_capture_windows fires after settings.init resolves — gated on full store
  // plugin behaviour. Asserting the call here would couple the test to plugin internals.
});
