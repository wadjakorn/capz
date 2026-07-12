import { describe, it, expect } from "vitest";
import {
  annotationAABB,
  contentBounds,
  OVERFLOW_GAP,
  type AABB,
} from "./annotationBounds";
import type { ArrowAnnotation } from "@/stores/editor";

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
