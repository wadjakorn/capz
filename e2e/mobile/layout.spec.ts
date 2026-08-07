import { test, expect } from "@playwright/test";

test("the tool-options panel is off-canvas until opened on a phone", async ({
  page,
}) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");

  const panel = page.locator("#tool-options-slot");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: /tool options/i }).click();
  await expect(panel).toBeVisible();
});

test("the canvas area gets the full width on a phone", async ({ page }) => {
  await page.goto("/paste");
  await page.waitForLoadState("networkidle");
  const main = page.locator("main");
  const box = (await main.boundingBox())!;
  const viewport = page.viewportSize()!;
  // Within a pixel of the full width — no 240px sidebar stealing space.
  expect(box.width).toBeGreaterThan(viewport.width - 2);
});
