import { describe, expect, it } from "vitest";
import { darkWeight, strokeDeviceRect, toDarkMask } from "./highlightBlend";

const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

describe("darkWeight", () => {
  it("is fully screen over black", () => {
    expect(darkWeight(0, 0, 0, 255)).toBe(1);
  });

  it("is fully multiply over white", () => {
    expect(darkWeight(255, 255, 255, 255)).toBe(0);
  });

  it("blends evenly at mid-grey", () => {
    expect(darkWeight(128, 128, 128, 255)).toBeCloseTo(0.5, 1);
  });

  it("is fully screen below 0.4 and fully multiply above 0.6", () => {
    expect(darkWeight(90, 90, 90, 255)).toBe(1); // ~0.35
    expect(darkWeight(166, 166, 166, 255)).toBe(0); // ~0.65
  });

  it("counts transparent pixels as white", () => {
    expect(darkWeight(0, 0, 0, 0)).toBe(0);
  });

  it("uses Rec. 709 luminance (pure blue is dark, pure green is light)", () => {
    expect(darkWeight(0, 0, 255, 255)).toBe(1);
    expect(darkWeight(0, 255, 0, 255)).toBe(0);
  });
});

describe("toDarkMask", () => {
  it("rewrites each pixel to black with alpha = dark weight", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255]);
    toDarkMask(data);
    expect(Array.from(data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(data.slice(4, 8))).toEqual([0, 0, 0, 0]);
    expect(data[11]).toBeGreaterThan(110);
    expect(data[11]).toBeLessThan(145);
  });
});

describe("strokeDeviceRect", () => {
  it("pads the points' bounds by half the stroke width", () => {
    expect(strokeDeviceRect([10, 20, 110, 20], 20, ID, 1000, 1000)).toEqual({
      x: 0,
      y: 10,
      w: 120,
      h: 20,
    });
  });

  it("maps through the device transform (scale + translate)", () => {
    const m = { a: 2, b: 0, c: 0, d: 2, e: 5, f: 7 };
    expect(strokeDeviceRect([10, 10, 20, 10], 4, m, 1000, 1000)).toEqual({
      x: 21,
      y: 23,
      w: 28,
      h: 8,
    });
  });

  it("covers a rotated stroke", () => {
    // 90° rotation: (x, y) → (-y, x), shifted into view.
    const m = { a: 0, b: 1, c: -1, d: 0, e: 100, f: 0 };
    expect(strokeDeviceRect([10, 10, 50, 10], 10, m, 1000, 1000)).toEqual({
      x: 85,
      y: 5,
      w: 10,
      h: 50,
    });
  });

  it("clips to the canvas and returns null when off-canvas", () => {
    expect(strokeDeviceRect([-50, 5, 50, 5], 10, ID, 30, 30)).toEqual({ x: 0, y: 0, w: 30, h: 10 });
    expect(strokeDeviceRect([500, 500, 600, 500], 10, ID, 30, 30)).toBeNull();
  });

  it("returns null without a point", () => {
    expect(strokeDeviceRect([], 10, ID, 30, 30)).toBeNull();
  });
});
