import { describe, expect, it } from "vitest";
import { cameraAt, cameraTransform, easeInOut, viewportRect, type CameraKey } from "./heroCamera";

const keys: CameraKey[] = [
  { t: 0, x: 0.5, y: 0.5, s: 1 },
  { t: 1, x: 0.4, y: 0.6, s: 2 },
  { t: 3, x: 0.4, y: 0.6, s: 2 },
];

describe("cameraAt", () => {
  it("holds the first key before it and the last key after it", () => {
    expect(cameraAt(keys, -1)).toEqual({ x: 0.5, y: 0.5, s: 1 });
    expect(cameraAt(keys, 10)).toEqual({ x: 0.4, y: 0.6, s: 2 });
  });
  it("eases between keys and is exact at keyframes", () => {
    expect(cameraAt(keys, 1)).toEqual({ x: 0.4, y: 0.6, s: 2 });
    const mid = cameraAt(keys, 0.5);
    expect(mid.s).toBeCloseTo(1.5);
    expect(cameraAt(keys, 0.25).s).toBeLessThan(1.25); // ease-in: slower than linear early
  });
  it("returns the full frame with no keys", () => {
    expect(cameraAt([], 2)).toEqual({ x: 0.5, y: 0.5, s: 1 });
  });
  it("easeInOut is clamped and symmetric", () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe("cameraTransform", () => {
  it("is identity at zoom 1", () => {
    expect(cameraTransform({ x: 0.2, y: 0.9, s: 1 }, 400, 250)).toEqual({ tx: 0, ty: 0, s: 1 });
  });
  it("centres the focus point when there is room", () => {
    const { tx, ty, s } = cameraTransform({ x: 0.5, y: 0.5, s: 2 }, 400, 250);
    expect(s).toBe(2);
    expect(tx).toBe(-200);
    expect(ty).toBe(-125);
  });
  it("clamps so the frame never shows past the video edges", () => {
    const corner = cameraTransform({ x: 0, y: 1, s: 2 }, 400, 250);
    expect(corner.tx).toBe(0);
    expect(corner.ty).toBe(-250);
  });
  it("reports the visible rect for the mini-map", () => {
    const r = viewportRect({ x: 0.5, y: 0.5, s: 2 }, 400, 250);
    expect(r).toEqual({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 });
  });
});
