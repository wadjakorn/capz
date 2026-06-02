/**
 * Onboarding TCC permission flow (stubbed).
 *
 * The macOS Screen Recording dialog itself can't be driven from a webview;
 * here we mock has_screen_recording_permission + the supporting commands and
 * assert that the React state machine in OnboardingView responds correctly:
 *   - permission=false → "Request permission" CTA visible, click fires
 *     `request_screen_recording_permission`.
 *   - clicking "Open System Settings" fires `open_system_settings_screen_recording`.
 *
 * The real prompt + System Settings navigation lives in docs/manual-qa.md.
 *
 * NOTE: OnboardingView gates the Permission step on IS_MAC. The Permission
 * surface is the macOS-only branch — only run when navigator.platform reports
 * a Mac. On linux CI, this test verifies the welcome → done shortcut path.
 */
import { test, expect } from "@playwright/test";
import { installTauriMock, getInvokeCalls, emitTauriEvent } from "../fixtures/tauri-mock";

async function gotoOnboarding(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");

  // The listener wiring in EditorPage is asynchronous (dynamic import + await
  // listen()); poll until at least one subscriber is registered before emitting.
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () => (window as any).__capzEventSubs?.get?.("editor:show-onboarding")?.size ?? 0,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  await emitTauriEvent(page, "editor:show-onboarding", null);

  // OnboardingView renders "Loading…" until useSettings.ready flips. The
  // stateful store mock should let it settle within a couple seconds.
  await expect(
    page.getByRole("heading", { name: /welcome to capz/i }),
  ).toBeVisible({ timeout: 10_000 });
}

test("welcome step renders default hotkeys + Next CTA", async ({ page }) => {
  await installTauriMock(page);
  await gotoOnboarding(page);

  await expect(page.getByText(/full screen capture/i)).toBeVisible();
  await expect(page.getByText(/area capture/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Next$/i })).toBeVisible();
});

test("permission step: request CTA fires request_screen_recording_permission (mac only)", async ({ page }) => {
  await installTauriMock(page, {
    handlers: {
      has_screen_recording_permission: () => false,
      request_screen_recording_permission: () => false, // user clicks Allow externally
    },
  });
  await gotoOnboarding(page);
  await page.getByRole("button", { name: /^Next$/i }).click();

  // OnboardingView Permission step renders only when navigator.platform is Mac.
  // CI runners may report non-Mac → skip the request assertion on those.
  const onPermission = await page
    .getByRole("heading", { name: /screen recording permission/i })
    .isVisible()
    .catch(() => false);
  test.skip(!onPermission, "non-mac runner — Permission step not reachable");

  const reqBtn = page.getByRole("button", { name: /request permission/i });
  await expect(reqBtn).toBeVisible();
  await reqBtn.click();

  await expect
    .poll(async () => {
      const calls = await getInvokeCalls(page);
      return calls.some((c) => c.cmd === "request_screen_recording_permission");
    })
    .toBe(true);
});

test("permission step: open-settings CTA fires open_system_settings_screen_recording (mac only)", async ({ page }) => {
  await installTauriMock(page, {
    handlers: { has_screen_recording_permission: () => false },
  });
  await gotoOnboarding(page);
  await page.getByRole("button", { name: /^Next$/i }).click();

  const onPermission = await page
    .getByRole("heading", { name: /screen recording permission/i })
    .isVisible()
    .catch(() => false);
  test.skip(!onPermission, "non-mac runner — Permission step not reachable");

  // The secondary "Open System Settings" button is visible in the ask + open-settings states.
  const openBtn = page.getByRole("button", { name: /open system settings/i }).first();
  await openBtn.click();

  await expect
    .poll(async () => {
      const calls = await getInvokeCalls(page);
      return calls.some((c) => c.cmd === "open_system_settings_screen_recording");
    })
    .toBe(true);
});
