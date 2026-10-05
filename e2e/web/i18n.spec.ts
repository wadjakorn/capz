// Language behaviour, so these specs do NOT pin English (see fixtures/test.ts).
import { unpinnedTest as test, expect } from "../fixtures/test";
import { installTauriMock, getInvokeCalls } from "../fixtures/tauri-mock";

test("/paste starts in Thai and switches to English in place", async ({ page }) => {
  await page.goto("/paste");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByText(/Choose an image/i)).toHaveCount(0);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText(/Choose an image/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a fresh desktop install runs in Thai and tells Rust", async ({ page }) => {
  // The store mock returns nothing persisted → DEFAULT_CONFIG → language "th".
  await installTauriMock(page);
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect
    .poll(async () =>
      (await getInvokeCalls(page)).some(
        (c) => c.cmd === "set_ui_language" && (c.args as { lang?: string }).lang === "th",
      ),
    )
    .toBe(true);
});
