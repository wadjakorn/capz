/**
 * Sticker sets (CP-0048): Settings → Library → Stickers lists the built-in
 * sets with on/off switches and adds user folders; the editor's sticker
 * picker shows one tab per enabled set.
 */
import { test, expect } from "../fixtures/test";
import { installTauriMock } from "../fixtures/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page, {
    handlers: {
      "plugin:dialog|open": () => "/Users/test/Team Stickers",
      list_stickers: () => [
        {
          name: "logo.png",
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        },
      ],
    },
  });
});

async function openStickerSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: /^Library\b/ })
    .click();
  await page.locator('[data-setting-id="library.stickers"]').getByRole("button", { name: "Manage…" }).click();
}

test("settings toggles a built-in set and adds a folder set", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  await openStickerSettings(page);

  for (const name of ["Emoji", "Pointers", "Status", "Reactions", "Cursors", "Paper"]) {
    await expect(page.getByRole("switch", { name: `Show ${name} in the picker` })).toBeChecked();
  }
  await page.getByRole("switch", { name: "Show Paper in the picker" }).click();
  await expect(page.getByRole("switch", { name: "Show Paper in the picker" })).not.toBeChecked();

  await page.getByRole("button", { name: "Add folder…" }).click();
  await expect(page.getByRole("textbox", { name: "Folder set name" })).toHaveValue("Team Stickers");
  await expect(page.getByRole("switch", { name: "Show Team Stickers in the picker" })).toBeChecked();

  // Adding the same folder twice is refused.
  await page.getByRole("button", { name: "Add folder…" }).click();
  await expect(page.getByText("That folder is already added.")).toBeVisible();
});

test("the last enabled set can't be switched off", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForLoadState("networkidle");
  await openStickerSettings(page);
  for (const name of ["Emoji", "Pointers", "Status", "Reactions", "Cursors"]) {
    await page.getByRole("switch", { name: `Show ${name} in the picker` }).click();
  }
  await page.getByRole("switch", { name: "Show Paper in the picker" }).click();
  await expect(page.getByText("Keep at least one set on.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show Paper in the picker" })).toBeChecked();
});
