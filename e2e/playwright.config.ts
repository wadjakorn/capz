import { defineConfig, devices } from "@playwright/test";

const PORT = 1420;
const BASE_URL = `http://localhost:${PORT}`;

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
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "tauri",
      testMatch: /tauri\/.*\.spec\.ts/,
      // Tier 2: separate runner sets up tauri-driver; skipped unless explicitly invoked.
      use: {},
    },
  ],
});
