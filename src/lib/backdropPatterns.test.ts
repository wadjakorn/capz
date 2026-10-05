import { describe, it, expect } from "vitest";
import { MAX_BOX_CANVAS, PATTERNS, mulberry32, renderPattern } from "./backdropPatterns";

/**
 * jsdom has no 2D canvas, so render into a stub whose context records calls
 * and serves zeroed ImageData — enough to exercise every draw path and the
 * sizing math without a real rasterizer.
 */
function stubCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = { width: w, height: h } as HTMLCanvasElement;
  const calls: string[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    { canvas, calls } as Record<string | symbol, unknown>,
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === "getImageData")
          return (_x: number, _y: number, iw: number, ih: number) => ({
            data: new Uint8ClampedArray(iw * ih * 4),
          });
        if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
        return () => {
          calls.push(String(key));
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  (canvas as unknown as { getContext: () => unknown }).getContext = () => ctx;
  return canvas;
}

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, a);
    expect(seqA).toEqual(Array.from({ length: 50 }, b));
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(seqA[0]);
  });
});

describe("renderPattern", () => {
  it("draws every pattern without throwing", () => {
    for (const [id, p] of Object.entries(PATTERNS)) {
      expect(() => renderPattern(p, 600, 400, 1, stubCanvas), id).not.toThrow();
    }
  });

  it("sizes tiles by the unit scale and repeats them", () => {
    const r = renderPattern(PATTERNS.gingham, 5000, 5000, 2, stubCanvas);
    expect(r.repeat).toBe("repeat");
    expect(r.scale).toBe(1);
    expect(r.canvas.width).toBe(PATTERNS.gingham.tile * 2);
  });

  it("renders box compositions at box size, capped and upscaled past the cap", () => {
    const small = renderPattern(PATTERNS.bauhaus, 800, 500, 1, stubCanvas);
    expect([small.canvas.width, small.canvas.height, small.scale]).toEqual([800, 500, 1]);
    const big = renderPattern(PATTERNS.bauhaus, MAX_BOX_CANVAS * 2, 1000, 1, stubCanvas);
    expect(big.canvas.width).toBe(MAX_BOX_CANVAS);
    expect(big.canvas.height).toBe(500);
    expect(big.scale).toBe(2);
    expect(big.repeat).toBe("no-repeat");
  });

  it("tile patterns repeat cleanly with the twill period", () => {
    // 2/2 twill repeats every 4 threads; a tile that isn't a multiple would seam.
    expect((PATTERNS.houndstooth.tile / 3) % 4).toBe(0);
    expect((PATTERNS.tartan.tile / 2) % 4).toBe(0);
  });
});
