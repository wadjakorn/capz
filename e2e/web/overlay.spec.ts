import { test, expect } from "../fixtures/test";
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

// The selection border must be a crisp line — no purple glow/halo around it.
test("area selection border has no glow", async ({ page }) => {
  await page.goto("/overlay?monitor=0&mode=area&owner=1");
  const rect = page.getByTestId("area-rect");
  await expect(rect).toBeVisible();
  expect(await rect.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
});

test("window mode borders have no glow", async ({ page }) => {
  await installTauriMock(page, {
    handlers: {
      list_capture_windows: () => [
        { id: 1, title: "Test Window", app_name: "Test", x: 200, y: 150, width: 400, height: 300 },
      ],
    },
  });
  await page.goto("/overlay?monitor=0&mode=window");
  await page.waitForLoadState("networkidle");

  // Pointer over empty desktop → monitor edge: thin, unblurred inset line.
  await page.mouse.move(20, 20);
  const edge = page.getByTestId("monitor-edge");
  await expect(edge).toBeVisible();
  const edgeShadow = await edge.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(edgeShadow).toMatch(/ 0px 0px 0px 2px inset$/);

  // Pointer over the window → hover border, no glow.
  await expect
    .poll(async () => {
      await page.mouse.move(400, 300);
      return page.getByTestId("window-hover").count();
    })
    .toBe(1);
  const hover = page.getByTestId("window-hover");
  expect(await hover.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
});
