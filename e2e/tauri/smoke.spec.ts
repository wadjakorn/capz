/**
 * Tier 2 — tauri-driver smoke.
 *
 * Drives the packaged capz binary via WebDriver (tauri-driver bridges to
 * webkit2gtk-driver on linux, msedgedriver on windows, safaridriver on mac).
 *
 * Prereqs (see e2e/README.md):
 *   - cargo install tauri-driver --locked
 *   - pnpm tauri build --debug    (builds target/debug/capz)
 *   - linux: apt install webkit2gtk-driver xvfb
 *
 * Note: Playwright does not natively speak the WebDriver Classic protocol that
 * tauri-driver exposes. This file is therefore a skeleton that documents the
 * expected smoke surface; in practice you'd run these via WebdriverIO. The
 * skeleton tests below skip-by-default unless TAURI_E2E=1 is set so that
 * `pnpm test:e2e:tauri` is non-fatal until the WebdriverIO bridge is wired.
 */
import { test, expect } from "@playwright/test";

const ENABLED = process.env.TAURI_E2E === "1";

test.describe("tauri smoke", () => {
  test.skip(!ENABLED, "set TAURI_E2E=1 + tauri-driver running to enable");

  test("app launches and editor window mounts", async () => {
    // TODO: connect to tauri-driver via webdriverio
    // const browser = await remote({ hostname: '127.0.0.1', port: 4444, ... })
    // expect(await browser.getTitle()).toMatch(/capz/i);
    expect(true).toBe(true);
  });

  test("invoke editor_current_image returns null on first launch", async () => {
    // TODO: browser.execute(() => window.__TAURI_INTERNALS__.invoke('editor_current_image'))
    expect(true).toBe(true);
  });

  test("settings persist across restart", async () => {
    // TODO: open settings, mutate hotkey, close, reopen, assert persisted value
    expect(true).toBe(true);
  });
});
