import { describe, it, expect } from "vitest";
import {
  annotationAABB,
  annotationsInRect,
  unionAABB,
  contentBounds,
  OVERFLOW_GAP,
  type AABB,
} from "./annotationBounds";
import type {
  ArrowAnnotation,
  FreehandAnnotation,
  MagnifyAnnotation,
} from "@/stores/editor";

// A rendered element box (as node.getClientRect would report it).
function box(x: number, y: number, w: number, h: number): AABB {
  return { x, y, w, h };
}

describe("contentBounds", () => {
  it("equals the image rect when there are no elements", () => {
    expect(contentBounds(800, 600, [])).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("equals the image rect when every element is fully inside", () => {
    const boxes: AABB[] = [box(10, 10, 100, 50), box(700, 500, 40, 40)];
    expect(contentBounds(800, 600, boxes)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("grows only the overflowed sides, each by overflow + gap", () => {
    const boxes: AABB[] = [box(750, 550, 100, 100)];
    // crosses right by 50 and bottom by 50; left/top stay flush at the image.
    expect(contentBounds(800, 600, boxes)).toEqual({
      x: 0,
      y: 0,
      w: 850 + OVERFLOW_GAP,
      h: 650 + OVERFLOW_GAP,
    });
  });

  it("leaves the opposite (non-overflow) side flush with the image", () => {
    const boxes: AABB[] = [box(-40, -30, 50, 50)];
    const b = contentBounds(800, 600, boxes);
    // crossed left/top → negative origin + gap; right/bottom untouched.
    expect(b.x).toBe(-(40 + OVERFLOW_GAP));
    expect(b.y).toBe(-(30 + OVERFLOW_GAP));
    expect(b.x + b.w).toBe(800); // right edge flush
    expect(b.y + b.h).toBe(600); // bottom edge flush
  });

  it("gives the same padding for the same overflow regardless of side", () => {
    const overRight = contentBounds(800, 600, [box(800, 285, 30, 30)]);
    const overLeft = contentBounds(800, 600, [box(-30, 285, 30, 30)]);
    const rightPad = overRight.x + overRight.w - 800; // white past the right edge
    const leftPad = -overLeft.x; // white past the left edge
    expect(rightPad).toBe(leftPad);
    expect(rightPad).toBe(30 + OVERFLOW_GAP);
  });

  it("leaves a gap between the farthest element and the boundary", () => {
    const b = contentBounds(800, 600, [box(800, 0, 30, 30)]); // 30px past right
    expect(b.x + b.w - 830).toBe(OVERFLOW_GAP); // 830 = element's right edge
  });

  it("rounds fractional overflow outward so no edge is clipped", () => {
    const b = contentBounds(100, 100, [box(-0.5, 0, 10, 10)]);
    expect(Number.isInteger(b.x)).toBe(true);
    expect(b.x).toBe(Math.floor(-0.5 - OVERFLOW_GAP));
  });
});

describe("annotationAABB arrow", () => {
  const base: ArrowAnnotation = {
    id: "a1",
    type: "arrow",
    x1: 10,
    y1: 20,
    x2: 50,
    y2: 40,
    stroke: "#f00",
    strokeWidth: 4,
  };

  it("spans the two endpoints for a straight arrow", () => {
    expect(annotationAABB(base)).toEqual({ x: 10, y: 20, w: 40, h: 20 });
  });

  it("grows to include the mid curve-control point when it bulges out", () => {
    const curved: ArrowAnnotation = { ...base, cx: 30, cy: 80 };
    // cy=80 is below both endpoints, so the box extends down to it.
    expect(annotationAABB(curved)).toEqual({ x: 10, y: 20, w: 40, h: 60 });
  });

  it("ignores a control point that sits inside the endpoint box", () => {
    const curved: ArrowAnnotation = { ...base, cx: 30, cy: 30 };
    expect(annotationAABB(curved)).toEqual({ x: 10, y: 20, w: 40, h: 20 });
  });
});

describe("annotationAABB pen/magnify", () => {
  it("bounds a freehand path from its point extents", () => {
    const pen: FreehandAnnotation = {
      id: "p1",
      type: "pen",
      points: [10, 10, 30, 5, 20, 40],
      stroke: "#f00",
      strokeWidth: 4,
      mode: "raw",
    };
    expect(annotationAABB(pen)).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });

  it("returns null for a degenerate (single-point) path", () => {
    const pen: FreehandAnnotation = {
      id: "p2",
      type: "pen",
      points: [10, 10],
      stroke: "#f00",
      strokeWidth: 4,
      mode: "raw",
    };
    expect(annotationAABB(pen)).toBeNull();
  });

  it("covers the magnify output loupe and its source point", () => {
    const mag: MagnifyAnnotation = {
      id: "m1",
      type: "magnify",
      sx: 30,
      sy: 60,
      srw: 20,
      srh: 20,
      x: 100,
      y: 60,
      zoom: 2,
      shape: "circle",
      stroke: "#facc15",
      strokeWidth: 3,
    };
    // Source area 30±20 → [10,50]; output half 20×2=40 at (100,60) → [60,140]×[20,100].
    expect(annotationAABB(mag)).toEqual({ x: 10, y: 20, w: 130, h: 80 });
  });
});

describe("annotationsInRect (marquee, CP-0050)", () => {
  const r = (id: string, x: number, y: number) =>
    ({ id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 }) as const;
  const list = [r("in", 10, 10), r("half", 25, 10), r("out", 100, 100)];

  it("keeps only annotations whose AABB is fully inside", () => {
    expect(annotationsInRect(list, { x: 0, y: 0, w: 30, h: 30 })).toEqual(["in"]);
  });

  it("accepts a rect dragged up-left (negative w/h)", () => {
    expect(annotationsInRect(list, { x: 40, y: 40, w: -40, h: -40 })).toEqual(["in", "half"]);
  });

  it("an edge-touching AABB counts as inside", () => {
    expect(annotationsInRect(list, { x: 10, y: 10, w: 10, h: 10 })).toEqual(["in"]);
  });

  it("judges each annotation by the box boxOf measures (drawn, rotated)", () => {
    // "out" is drawn inside the rect even though its frame is far away.
    const drawn = (a: { id: string }) =>
      a.id === "out" ? { x: 1, y: 1, w: 5, h: 5 } : annotationAABB(list.find((l) => l.id === a.id)!);
    expect(annotationsInRect(list, { x: 0, y: 0, w: 30, h: 30 }, drawn)).toEqual(["in", "out"]);
  });
});

describe("unionAABB", () => {
  it("covers every box; null for none", () => {
    expect(unionAABB([box(0, 0, 10, 10), box(20, -5, 5, 5)])).toEqual(box(0, -5, 25, 15));
    expect(unionAABB([])).toBeNull();
  });
});
