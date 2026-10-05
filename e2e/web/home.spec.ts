import { test, expect } from "../fixtures/test";

test("home page mounts", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator("body")).toBeVisible();
});
