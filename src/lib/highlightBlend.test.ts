import { describe, expect, it } from "vitest";
import {
  highlightBox,
  lumaGridFromRGBA,
  pickHighlightBlend,
} from "./highlightBlend";

/** RGBA buffer for a cols×rows grid where `px(c, r)` gives [r, g, b, a]. */
function rgba(cols: number, rows: number, px: (c: number, r: number) => number[]) {
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) data.set(px(c, r), (r * cols + c) * 4);
  return data;
}

const solid = (v: number) => () => [v, v, v, 255];
// Grid of 4×4 cells over a 400×400 source image (100 px per cell).
const grid = (px: (c: number, r: number) => number[]) =>
  lumaGridFromRGBA(rgba(4, 4, px), 4, 4, 400, 400);
const whole = { x: 0, y: 0, w: 400, h: 400 };

describe("pickHighlightBlend", () => {
  it("screens over black", () => {
    expect(pickHighlightBlend(grid(solid(0)), whole)).toBe("screen");
  });

  it("multiplies over white", () => {
    expect(pickHighlightBlend(grid(solid(255)), whole)).toBe("multiply");
  });

  it("multiplies over mid-grey (#808080 is just above 0.5)", () => {
    expect(pickHighlightBlend(grid(solid(128)), whole)).toBe("multiply");
  });

  it("follows the majority of a mixed region", () => {
    // Columns 0–2 black, column 3 white.
    const g = grid((c) => (c < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(pickHighlightBlend(g, whole)).toBe("screen");
    // Only the white column → multiply; only a black column → screen.
    expect(pickHighlightBlend(g, { x: 300, y: 0, w: 100, h: 400 })).toBe("multiply");
    expect(pickHighlightBlend(g, { x: 0, y: 0, w: 100, h: 400 })).toBe("screen");
    // Mostly white: 1 black column of 4 → multiply.
    const g2 = grid((c) => (c < 1 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(pickHighlightBlend(g2, whole)).toBe("multiply");
  });

  it("samples a small box inside a single cell", () => {
    const g = grid((c) => (c < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(pickHighlightBlend(g, { x: 10, y: 10, w: 5, h: 5 })).toBe("screen");
    expect(pickHighlightBlend(g, { x: 390, y: 10, w: 5, h: 5 })).toBe("multiply");
  });

  it("multiplies when the box is outside the image or there is no grid", () => {
    expect(pickHighlightBlend(grid(solid(0)), { x: 500, y: 500, w: 50, h: 50 })).toBe(
      "multiply",
    );
    expect(pickHighlightBlend(null, whole)).toBe("multiply");
    expect(pickHighlightBlend(grid(solid(0)), null)).toBe("multiply");
  });

  it("treats transparent pixels as white", () => {
    expect(pickHighlightBlend(grid(() => [0, 0, 0, 0]), whole)).toBe("multiply");
  });

  it("weights channels by perceived luminance", () => {
    // Pure blue is dark (0.07), pure green is light (0.72).
    expect(pickHighlightBlend(grid(() => [0, 0, 255, 255]), whole)).toBe("screen");
    expect(pickHighlightBlend(grid(() => [0, 255, 0, 255]), whole)).toBe("multiply");
  });
});

describe("highlightBox", () => {
  it("pads the points' bounds by half the stroke width", () => {
    expect(highlightBox([10, 20, 110, 40], 20, 0, 0)).toEqual({
      x: 0,
      y: 10,
      w: 120,
      h: 40,
    });
  });

  it("shifts into source-image pixels by the crop offset", () => {
    expect(highlightBox([10, 20, 110, 40], 20, 50, 5)).toEqual({
      x: 50,
      y: 15,
      w: 120,
      h: 40,
    });
  });

  it("handles a single point (a dot) and returns null with no points", () => {
    expect(highlightBox([10, 10], 4, 0, 0)).toEqual({ x: 8, y: 8, w: 4, h: 4 });
    expect(highlightBox([], 4, 0, 0)).toBeNull();
  });
});
