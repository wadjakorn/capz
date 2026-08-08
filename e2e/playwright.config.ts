import { defineConfig, devices } from "@playwright/test";

const PORT = 1420;
const BASE_URL = `http://localhost:${PORT}`;

// Playwright ships no browser build for some newer Linux distros (e.g. Ubuntu
// 26.04), where `playwright install chromium` fails outright. Set
// PLAYWRIGHT_CHANNEL=chrome to run against a system-installed Chrome instead.
// Unset — as in CI, which uses the downloaded browser — this changes nothing.
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL;
const channelOverride = CHANNEL ? { channel: CHANNEL } : {};

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "NEXT_PUBLIC_TEST=1 pnpm dev",
    url: BASE_URL,
    cwd: "..",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    {
      name: "web",
      testMatch: /web\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...channelOverride },
    },
    {
      name: "mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices["Pixel 5"], ...channelOverride },
    },
    {
      name: "tauri",
      testMatch: /tauri\/.*\.spec\.ts/,
      // Tier 2: separate runner sets up tauri-driver; skipped unless explicitly invoked.
      use: {},
    },
  ],
});
