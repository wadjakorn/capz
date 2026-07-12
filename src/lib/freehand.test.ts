import { describe, it, expect } from "vitest";
import { rdpSimplify, smoothPoints } from "./freehand";

describe("rdpSimplify", () => {
  it("passes through paths with fewer than 3 points", () => {
    expect(rdpSimplify([0, 0], 1)).toEqual([0, 0]);
    expect(rdpSimplify([0, 0, 10, 10], 1)).toEqual([0, 0, 10, 10]);
  });

  it("drops a nearly-collinear midpoint", () => {
    // Middle point is only 0.5px off the straight line 0,0 → 10,0.
    const out = rdpSimplify([0, 0, 5, 0.5, 10, 0], 2);
    expect(out).toEqual([0, 0, 10, 0]);
  });

  it("keeps a midpoint that deviates beyond epsilon", () => {
    const out = rdpSimplify([0, 0, 5, 6, 10, 0], 2);
    expect(out).toEqual([0, 0, 5, 6, 10, 0]);
  });

  it("always keeps the first and last point", () => {
    const out = rdpSimplify([0, 0, 1, 0.1, 2, 0.1, 3, 0], 5);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([3, 0]);
  });
});

describe("smoothPoints", () => {
  const zig = [0, 0, 5, 1, 10, 0, 15, 1, 20, 0];

  it("raw keeps at least as much detail as curve, no tension", () => {
    const raw = smoothPoints(zig, "raw");
    const curve = smoothPoints(zig, "curve");
    expect(raw.tension).toBe(0);
    // Smaller epsilon (raw) keeps >= points than the larger-epsilon curve.
    expect(raw.points.length).toBeGreaterThanOrEqual(curve.points.length);
    expect(raw.points.length).toBeGreaterThanOrEqual(4); // endpoints survive
  });

  it("curve applies tension", () => {
    const r = smoothPoints(zig, "curve");
    expect(r.tension).toBeGreaterThan(0);
  });

  it("polygon simplifies at least as much as raw", () => {
    const poly = smoothPoints(zig, "polygon");
    const raw = smoothPoints(zig, "raw");
    expect(poly.points.length).toBeLessThanOrEqual(raw.points.length);
    expect(poly.tension).toBe(0);
  });

  it("honors a custom polygon epsilon (larger → fewer points)", () => {
    const gentle = smoothPoints(zig, "polygon", { polygonEpsilon: 0.5 });
    const strong = smoothPoints(zig, "polygon", { polygonEpsilon: 40 });
    expect(strong.points.length).toBeLessThanOrEqual(gentle.points.length);
  });

  it("curve uses a fixed tension and honors custom smoothing", () => {
    const gentle = smoothPoints(zig, "curve", { curveSmoothing: 0 });
    const strong = smoothPoints(zig, "curve", { curveSmoothing: 40 });
    expect(gentle.tension).toBe(0.5);
    expect(strong.tension).toBe(0.5);
    // More smoothing → fewer points (rounder curve).
    expect(strong.points.length).toBeLessThanOrEqual(gentle.points.length);
  });
});
