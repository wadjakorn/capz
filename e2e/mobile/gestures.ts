import type { Page } from "@playwright/test";

type Pt = { x: number; y: number };

/**
 * Select the Shapes tool (id "rect") regardless of whether it renders as a
 * direct toolbar button or has been pushed into the "More tools" overflow
 * menu. On a Pixel 5 viewport the 44px touch targets (max-sm:h-11 w-11 on
 * ToolButton) leave less room in the toolbar row than the old 32px buttons,
 * so which state applies can vary with exactly what else is rendered in the
 * toolbar. Both are legitimate — this just picks whichever is present
 * instead of hardcoding one.
 */
export async function selectShapesTool(page: Page) {
  const direct = page.getByRole("button", { name: "Shapes", exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  await page.getByRole("button", { name: /more tools/i }).click();
  await page.getByRole("menuitem", { name: /^Shapes/ }).click();
}

const point = (p: Pt, id: number) => ({
  x: p.x,
  y: p.y,
  radiusX: 1,
  radiusY: 1,
  force: 1,
  id,
});

/** Move two contacts from `from` to `to` over `steps` frames. */
export async function twoFingerDrag(
  page: Page,
  from: [Pt, Pt],
  to: [Pt, Pt],
  steps = 10,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(from[0], 1), point(from[1], 2)],
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const lerp = (a: Pt, b: Pt): Pt => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(lerp(from[0], to[0]), 1), point(lerp(from[1], to[1]), 2)],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

/** Pinch centred on `center`: contacts start `from` apart and end `to` apart. */
export async function pinch(page: Page, center: Pt, from: number, to: number) {
  await twoFingerDrag(
    page,
    [
      { x: center.x - from / 2, y: center.y },
      { x: center.x + from / 2, y: center.y },
    ],
    [
      { x: center.x - to / 2, y: center.y },
      { x: center.x + to / 2, y: center.y },
    ],
  );
}
