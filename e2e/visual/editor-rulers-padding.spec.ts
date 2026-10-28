import { test, expect } from "../fixtures/test";
import { loadImage, snap } from "./helpers";

// Visual check for CP-0026: the rulers measure the whole exported canvas, so
// with backdrop padding on they read 0 at the padded frame's outer edge (not
// at the image edge). The ruler labels are canvas-drawn, so the numbers are
// for the human reading the screenshots; the label math itself is unit-tested
// in src/lib/rulerTicks.test.ts.

test("rulers count backdrop padding from the outer frame edge", async ({ page }) => {
  await loadImage(page);
  await page.getByRole("button", { name: "Rulers", exact: true }).click();
  await snap(page, "rulers-no-backdrop-0-at-image-edge");

  await page.getByRole("button", { name: "Show backdrop", exact: true }).click();
  await page.getByLabel("Padding").fill("64");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as unknown as { __capzStage?: { offsetX(): number } }).__capzStage;
        return s?.offsetX();
      }),
    )
    .toBe(-64);
  await snap(page, "rulers-padding-64-0-at-frame-edge");
});
