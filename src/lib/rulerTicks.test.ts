import { describe, expect, it } from "vitest";
import { niceStep, rulerTicks } from "./rulerTicks";

const labelAt = (t: ReturnType<typeof rulerTicks>, pos: number) =>
  t.major.find((m) => m.pos === pos)?.label;

describe("niceStep", () => {
  it("rounds up to 1/2/5 × 10^n", () => {
    expect(niceStep(50)).toBe(50);
    expect(niceStep(51)).toBe(100);
    expect(niceStep(25)).toBe(50);
    expect(niceStep(0)).toBe(1);
  });
});

describe("rulerTicks", () => {
  it("reads 0 at the canvas origin when there is no padding", () => {
    // Canvas origin scrolled exactly to the ruler's left edge.
    const t = rulerTicks({ scroll: 400, pad: 400, scale: 1, length: 300 });
    expect(t.major[0]).toEqual({ pos: 0.5, label: 0 });
    expect(t.major.map((m) => m.label)).toEqual([0, 50, 100, 150, 200, 250, 300]);
  });

  it("counts backdrop padding: 0 at the padded edge, 64 at the image edge", () => {
    // Canvas (padding 64 + image) starts 10px into the ruler.
    const t = rulerTicks({ scroll: 390, pad: 400, scale: 1, length: 300 });
    expect(labelAt(t, 10.5)).toBe(0);
    expect(labelAt(t, 60.5)).toBe(50);
    expect(labelAt(t, 110.5)).toBe(100);
    // The image edge (screen 10 + 64) falls between 50 and 100, i.e. it reads
    // 64 — not 0 as before.
    expect(t.major.some((m) => m.label < 0 && m.pos > 10.5)).toBe(false);
  });

  it("labels the image edge after 64px padding as 64", () => {
    // Zoom 25 → step 2, so 64 is a major tick.
    const t = rulerTicks({ scroll: 400, pad: 400, scale: 25, length: 2000 });
    expect(labelAt(t, 64 * 25 + 0.5)).toBe(64);
  });

  it("counts negative to the left of the canvas origin", () => {
    // Ruler shows grey space left of the canvas origin.
    const t = rulerTicks({ scroll: 300, pad: 400, scale: 1, length: 300 });
    expect(labelAt(t, 100.5)).toBe(0);
    // Ticks before the origin are still drawn, as negative canvas coords.
    expect(t.major[0].label).toBe(-100);
  });

  it("puts majors on round multiples of step from the new zero at any zoom", () => {
    for (const scale of [0.25, 0.5, 1, 2, 3.7]) {
      const t = rulerTicks({ scroll: 123, pad: 400, scale, length: 800 });
      const step = niceStep(50 / scale);
      expect(t.major.length).toBeGreaterThan(0);
      for (const m of t.major) {
        expect(Math.abs(m.label % step)).toBe(0);
        expect(m.pos).toBe(Math.round(400 + m.label * scale - 123) + 0.5);
      }
    }
  });

  it("labels the far edge with the exported width (overflow included)", () => {
    // Canvas 1000 wide (image 800 + 200 overflow), zoom 50%, scrolled so its
    // right edge is visible.
    const t = rulerTicks({ scroll: 600, pad: 400, scale: 0.5, length: 400 });
    expect(labelAt(t, Math.round(400 + 1000 * 0.5 - 600) + 0.5)).toBe(1000);
  });
});
