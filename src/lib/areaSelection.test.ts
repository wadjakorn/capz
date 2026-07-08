import { describe, it, expect } from "vitest";
import {
  centeredDefaultRect,
  clampRect,
  moveRect,
  resizeFromHandle,
  resizeBy,
  hitTestHandle,
  cursorForTarget,
  cssToOs,
  osToCss,
} from "./areaSelection";

const DW = 1000;
const DH = 800;
const MIN = 16;

describe("centeredDefaultRect", () => {
  it("is 60% of the display by default and centered", () => {
    expect(centeredDefaultRect(1000, 800)).toEqual({ x: 200, y: 160, w: 600, h: 480 });
  });
  it("honors a custom fraction", () => {
    expect(centeredDefaultRect(1000, 800, 0.5)).toEqual({ x: 250, y: 200, w: 500, h: 400 });
  });
});

describe("clampRect", () => {
  it("leaves an already-fitting rect untouched", () => {
    const r = { x: 100, y: 100, w: 200, h: 200 };
    expect(clampRect(r, DW, DH)).toEqual(r);
  });
  it("pushes an off-screen rect back inside without resizing", () => {
    expect(clampRect({ x: -50, y: -30, w: 200, h: 200 }, DW, DH)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 200,
    });
    expect(clampRect({ x: 950, y: 750, w: 200, h: 200 }, DW, DH)).toEqual({
      x: 800,
      y: 600,
      w: 200,
      h: 200,
    });
  });
  it("shrinks a rect larger than the display", () => {
    expect(clampRect({ x: 0, y: 0, w: 2000, h: 2000 }, DW, DH)).toEqual({
      x: 0,
      y: 0,
      w: DW,
      h: DH,
    });
  });
});

describe("moveRect", () => {
  it("translates and clamps to the display", () => {
    const r = { x: 100, y: 100, w: 200, h: 200 };
    expect(moveRect(r, 50, -30, DW, DH)).toEqual({ x: 150, y: 70, w: 200, h: 200 });
    // Driven past the right/bottom edge → clamped, size preserved.
    expect(moveRect(r, 5000, 5000, DW, DH)).toEqual({ x: 800, y: 600, w: 200, h: 200 });
  });
});

describe("resizeFromHandle", () => {
  const r = { x: 200, y: 200, w: 400, h: 300 };

  it("moves only the east edge for the 'e' handle", () => {
    expect(resizeFromHandle(r, "e", 50, 999, MIN, DW, DH)).toEqual({
      x: 200,
      y: 200,
      w: 450,
      h: 300,
    });
  });
  it("moves top+left for the 'nw' corner", () => {
    expect(resizeFromHandle(r, "nw", -50, -20, MIN, DW, DH)).toEqual({
      x: 150,
      y: 180,
      w: 450,
      h: 320,
    });
  });
  it("enforces the minimum size when dragging an edge inward", () => {
    const out = resizeFromHandle(r, "e", -1000, 0, MIN, DW, DH);
    expect(out.w).toBe(MIN);
    expect(out.x).toBe(200);
  });
  it("enforces the minimum when dragging the west edge inward", () => {
    const out = resizeFromHandle(r, "w", 1000, 0, MIN, DW, DH);
    expect(out.w).toBe(MIN);
    // west edge stops MIN short of the (fixed) right edge
    expect(out.x + out.w).toBe(600);
  });
  it("clamps a resized edge to the display bounds", () => {
    const out = resizeFromHandle(r, "e", 10000, 0, MIN, DW, DH);
    expect(out.x + out.w).toBe(DW);
  });
});

describe("resizeBy", () => {
  it("grows keeping the top-left anchored", () => {
    expect(resizeBy({ x: 100, y: 100, w: 200, h: 200 }, 10, -5, MIN, DW, DH)).toEqual({
      x: 100,
      y: 100,
      w: 210,
      h: 195,
    });
  });
  it("clamps to min and to the display edge", () => {
    expect(resizeBy({ x: 100, y: 100, w: 20, h: 20 }, -1000, 0, MIN, DW, DH).w).toBe(MIN);
    expect(resizeBy({ x: 100, y: 100, w: 200, h: 200 }, 10000, 0, MIN, DW, DH).w).toBe(DW - 100);
  });
});

describe("hitTestHandle", () => {
  const r = { x: 200, y: 200, w: 400, h: 300 };
  const HS = 16;

  it("detects each corner", () => {
    expect(hitTestHandle(r, 200, 200, HS)).toBe("nw");
    expect(hitTestHandle(r, 600, 200, HS)).toBe("ne");
    expect(hitTestHandle(r, 600, 500, HS)).toBe("se");
    expect(hitTestHandle(r, 200, 500, HS)).toBe("sw");
  });
  it("detects each edge midpoint", () => {
    expect(hitTestHandle(r, 400, 200, HS)).toBe("n");
    expect(hitTestHandle(r, 600, 350, HS)).toBe("e");
    expect(hitTestHandle(r, 400, 500, HS)).toBe("s");
    expect(hitTestHandle(r, 200, 350, HS)).toBe("w");
  });
  it("returns 'move' inside the body", () => {
    expect(hitTestHandle(r, 400, 350, HS)).toBe("move");
  });
  it("returns null well outside the rect", () => {
    expect(hitTestHandle(r, 50, 50, HS)).toBeNull();
  });
});

describe("cssToOs / osToCss", () => {
  // Union spans two 1000-wide displays; overlay window is half-res CSS (dpr 2).
  const union = { x: -1000, y: 0, w: 2000, h: 1000 };
  const vpW = 1000;
  const vpH = 500;

  it("maps CSS px to OS virtual coordinates with the union offset + scale", () => {
    expect(cssToOs({ x: 100, y: 50, w: 200, h: 100 }, union, vpW, vpH)).toEqual({
      x: -800, // -1000 + 100*2
      y: 100,
      w: 400,
      h: 200,
    });
  });

  it("round-trips through osToCss", () => {
    const rect = { x: 123, y: 77, w: 210, h: 90 };
    const os = cssToOs(rect, union, vpW, vpH);
    expect(osToCss(os, union, vpW, vpH)).toEqual(rect);
  });

  it("is a no-op scale when union matches the viewport", () => {
    const u = { x: 0, y: 0, w: 1000, h: 500 };
    const rect = { x: 10, y: 20, w: 30, h: 40 };
    expect(cssToOs(rect, u, 1000, 500)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
});

describe("cursorForTarget", () => {
  it("maps targets to CSS cursors", () => {
    expect(cursorForTarget("nw")).toBe("nwse-resize");
    expect(cursorForTarget("ne")).toBe("nesw-resize");
    expect(cursorForTarget("n")).toBe("ns-resize");
    expect(cursorForTarget("e")).toBe("ew-resize");
    expect(cursorForTarget("move")).toBe("move");
    expect(cursorForTarget(null)).toBe("crosshair");
  });
});
