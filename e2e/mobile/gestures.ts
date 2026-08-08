import type { Page } from "@playwright/test";

type Pt = { x: number; y: number };

/**
 * Select the Shapes tool (id "rect") via the toolbar's "More tools" overflow
 * menu. On the Pixel 5 viewport used by this project, the toolbar's overflow
 * math (Toolbar.tsx's useOverflowSlots call, sized to ToolButton's actual
 * max-sm:h-11 max-sm:w-11 44px footprint plus a 4px gap) leaves the palette
 * 102px wide — one 48px slot for a tool, one reserved for the overflow
 * trigger. So only the first tool (Select) renders as a direct button, and
 * every tool after it — including Shapes — always renders inside the overflow
 * menu. This asserts that single stable state rather than tolerating either
 * outcome, so a regression in the fit math (or in the sizing of ToolButton or
 * of the toolbar controls that share the palette's row and therefore set how
 * much width is left for it) fails this helper instead of silently passing
 * through a fallback branch.
 */
export async function selectShapesTool(page: Page) {
  await selectOverflowTool(page, /^Shapes/);
}

/**
 * Select the Pin tool, which lives in the same overflow menu as Shapes (see
 * above). Unlike Shapes, Pin commits an annotation on `pointerdown` alone with
 * no drag, so it is the tool that exercises the immediate-commit path.
 */
export async function selectPinTool(page: Page) {
  await selectOverflowTool(page, /^Pin/);
}

/** Select the Arrow tool, which lives in the same overflow menu (see above). */
export async function selectArrowTool(page: Page) {
  await selectOverflowTool(page, /^Arrow/);
}

async function selectOverflowTool(page: Page, name: RegExp) {
  await page.getByRole("button", { name: /more tools/i }).click();
  await page.getByRole("menuitem", { name }).click();
}

/** One-finger touch drag through the CDP touch pipeline. */
export async function oneFingerDrag(page: Page, from: Pt, to: Pt, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(from, 1)],
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        point(
          { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
          1,
        ),
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
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
