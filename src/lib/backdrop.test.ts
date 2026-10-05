import { describe, it, expect } from "vitest";
import {
  GRADIENT_PRESETS,
  DEFAULT_GRADIENT_ID,
  resolveGradient,
  paddedBox,
  colorStops,
  gradientPoints,
  canvasFill,
  BACKDROP_PRESETS,
  PATTERN_PRESETS,
  resolvePreset,
  patternUnit,
  type BackdropFill,
} from "./backdrop";
import type { RenderedPattern } from "./backdropPatterns";

describe("resolveGradient", () => {
  it("returns the matching preset", () => {
    expect(resolveGradient("indigo").id).toBe("indigo");
  });
  it("falls back to the first preset for unknown/empty ids", () => {
    expect(resolveGradient("nope").id).toBe(DEFAULT_GRADIENT_ID);
    expect(resolveGradient(null).id).toBe(DEFAULT_GRADIENT_ID);
    expect(resolveGradient(undefined).id).toBe(GRADIENT_PRESETS[0].id);
  });
});

describe("paddedBox", () => {
  it("inflates uniformly on all sides", () => {
    expect(paddedBox({ x: 0, y: 0, w: 100, h: 80 }, 20)).toEqual({
      x: -20,
      y: -20,
      w: 140,
      h: 120,
    });
  });
  it("shifts a negative origin further out", () => {
    expect(paddedBox({ x: -5, y: -10, w: 50, h: 50 }, 10)).toEqual({
      x: -15,
      y: -20,
      w: 70,
      h: 70,
    });
  });
  it("never shrinks: non-positive / non-finite padding is a no-op", () => {
    const box = { x: 1, y: 2, w: 3, h: 4 };
    expect(paddedBox(box, 0)).toEqual(box);
    expect(paddedBox(box, -5)).toEqual(box);
    expect(paddedBox(box, NaN)).toEqual(box);
  });
});

describe("colorStops", () => {
  it("distributes multiple colors evenly across [0,1]", () => {
    expect(colorStops(["#a", "#b"])).toEqual([0, "#a", 1, "#b"]);
    expect(colorStops(["#a", "#b", "#c"])).toEqual([0, "#a", 0.5, "#b", 1, "#c"]);
  });
  it("expands a single color to a flat ramp", () => {
    expect(colorStops(["#abc"])).toEqual([0, "#abc", 1, "#abc"]);
  });
  it("handles an empty list without throwing", () => {
    expect(colorStops([])).toEqual([0, "#000000", 1, "#000000"]);
  });
});

describe("gradientPoints", () => {
  it("spans left→right at 0°", () => {
    const { start, end } = gradientPoints(100, 40, 0);
    expect(start).toEqual({ x: 0, y: 20 });
    expect(end).toEqual({ x: 100, y: 20 });
  });
  it("spans top→bottom at 90°", () => {
    const { start, end } = gradientPoints(100, 40, 90);
    expect(start.x).toBeCloseTo(50);
    expect(start.y).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(50);
    expect(end.y).toBeCloseTo(40);
  });
  it("reaches both far corners on the diagonal at 135°", () => {
    const { start, end } = gradientPoints(100, 100, 135);
    // Direction (cos135, sin135) = (-0.707, 0.707): start near top-right,
    // end near bottom-left; both offsets equal in magnitude.
    expect(start.x).toBeCloseTo(100);
    expect(start.y).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(100);
  });
});

describe("canvasFill", () => {
  const gradientBackdrop: BackdropFill = {
    style: "gradient",
    presetId: "slate",
    solidColor: "#1b1f2a",
  };
  const solidBackdrop: BackdropFill = {
    style: "solid",
    presetId: "slate",
    solidColor: "#123456",
  };

  it("paints the gradient backdrop in backdrop mode", () => {
    const f = canvasFill(gradientBackdrop, 200, 100, "#ffffff", "backdrop");
    const g = resolveGradient("slate");
    expect(f.fill).toBeUndefined();
    expect(f.fillLinearGradientColorStops).toEqual(colorStops(g.colors));
    expect(f.fillLinearGradientStartPoint).toBeDefined();
    expect(f.fillLinearGradientEndPoint).toBeDefined();
  });

  it("paints the solid backdrop color in backdrop mode", () => {
    const f = canvasFill(solidBackdrop, 200, 100, "#ffffff", "backdrop");
    expect(f.fill).toBe("#123456");
    expect(f.fillLinearGradientColorStops).toBeUndefined();
  });

  it("uses the flush canvas color in flush mode regardless of style", () => {
    const g = canvasFill(gradientBackdrop, 200, 100, "#eeeeee", "flush");
    expect(g.fill).toBe("#eeeeee");
    expect(g.fillLinearGradientColorStops).toBeUndefined();
    const s = canvasFill(solidBackdrop, 200, 100, "#eeeeee", "flush");
    expect(s.fill).toBe("#eeeeee");
  });

  it("keeps every gradient key present so react-konva clears stale props", () => {
    const f = canvasFill(solidBackdrop, 10, 10, "#fff", "backdrop");
    expect("fillLinearGradientStartPoint" in f).toBe(true);
    expect("fillLinearGradientEndPoint" in f).toBe(true);
    expect("fillLinearGradientColorStops" in f).toBe(true);
  });
});

describe("backdrop presets", () => {
  it("has unique ids across every family", () => {
    const ids = BACKDROP_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships at least 5 minimal and 10 art presets", () => {
    expect(PATTERN_PRESETS.filter((p) => p.category === "minimal").length).toBeGreaterThanOrEqual(5);
    expect(PATTERN_PRESETS.filter((p) => p.category === "art").length).toBeGreaterThanOrEqual(10);
  });

  it("resolvePreset finds pattern presets and falls back to the default gradient", () => {
    expect(resolvePreset("gingham").kind).toBe("pattern");
    expect(resolvePreset("indigo").kind).toBe("linear");
    expect(resolvePreset("nope").id).toBe(DEFAULT_GRADIENT_ID);
    expect(resolvePreset(undefined).id).toBe(DEFAULT_GRADIENT_ID);
  });

  it("patternUnit is 1 up to 1600px and grows linearly past it", () => {
    expect(patternUnit(800)).toBe(1);
    expect(patternUnit(1600)).toBe(1);
    expect(patternUnit(3200)).toBe(2);
    expect(patternUnit(Number.NaN)).toBe(1);
  });
});

describe("canvasFill with pattern presets", () => {
  const pat: BackdropFill = { style: "gradient", presetId: "gingham", solidColor: "#000" };
  const fakeCanvas = {} as HTMLCanvasElement;

  it("paints the flat base until the pattern canvas exists", () => {
    const f = canvasFill(pat, 100, 100, "#fff", "backdrop", null);
    const p = resolvePreset("gingham");
    expect(p.kind === "pattern" && f.fill === p.base).toBe(true);
    expect(f.fillPatternImage).toBeUndefined();
  });

  it("uses the rendered canvas as a pattern fill", () => {
    const r: RenderedPattern = { canvas: fakeCanvas, repeat: "no-repeat", scale: 2 };
    const f = canvasFill(pat, 100, 100, "#fff", "backdrop", r);
    expect(f.fill).toBeUndefined();
    expect(f.fillPatternImage).toBe(fakeCanvas);
    expect(f.fillPatternRepeat).toBe("no-repeat");
    expect(f.fillPatternScaleX).toBe(2);
    expect(f.fillPatternScaleY).toBe(2);
    expect(f.fillLinearGradientColorStops).toBeUndefined();
  });

  it("drops the pattern in flush mode and for linear presets", () => {
    const r: RenderedPattern = { canvas: fakeCanvas, repeat: "repeat", scale: 1 };
    expect(canvasFill(pat, 10, 10, "#eee", "flush", r).fillPatternImage).toBeUndefined();
    const lin = canvasFill({ ...pat, presetId: "slate" }, 10, 10, "#eee", "backdrop", r);
    expect(lin.fillPatternImage).toBeUndefined();
    expect(lin.fillLinearGradientColorStops).toBeDefined();
  });

  it("keeps every pattern key present so react-konva clears stale props", () => {
    const f = canvasFill({ ...pat, style: "solid" }, 10, 10, "#fff", "backdrop");
    expect("fillPatternImage" in f).toBe(true);
    expect(f.fillPatternRepeat).toBe("repeat");
    expect(f.fillPatternScaleX).toBe(1);
    expect(f.fillPatternScaleY).toBe(1);
  });
});
