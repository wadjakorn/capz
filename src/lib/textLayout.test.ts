import { describe, expect, it } from "vitest";
import type { TextAnnotation } from "@/stores/editor";
import {
  CARET_SLACK,
  textBoxLayout,
  textEditorOverlay,
  textEffects,
  textEffectsCss,
  type InkMeasure,
} from "./textLayout";

// Fixed-width stub so layout maths don't depend on a real canvas.
const measure: InkMeasure = (text, fontSize) => ({
  ascent: fontSize * 0.8,
  descent: fontSize * 0.2,
  width: Math.max(...text.split("\n").map((l) => l.length)) * fontSize * 0.5,
  fontAscent: fontSize * 0.8,
  fontDescent: fontSize * 0.2,
});

const base: TextAnnotation = {
  id: "t1",
  type: "text",
  x: 100,
  y: 50,
  text: "hello",
  fontSize: 20,
  fill: "#fff",
};

describe("textBoxLayout", () => {
  it("has no padding or radius without a background", () => {
    const l = textBoxLayout({ ...base, bgPadding: 30 }, measure);
    expect(l.bg).toBeNull();
    expect(l.padX).toBe(0);
    expect(l.padY).toBe(0);
    expect(l.cornerRadius).toBe(0);
    expect(l.innerW).toBe(50);
    expect(l.w).toBe(50);
    expect(l.innerH).toBe(Math.ceil(20 * l.lineHeight));
    expect(l.h).toBe(l.innerH);
  });

  it("derives vertical padding and radius from the background padding", () => {
    const l = textBoxLayout(
      { ...base, backgroundColor: "#000", bgPadding: 10, lineHeight: 1.5 },
      measure,
    );
    expect(l.padX).toBe(10);
    expect(l.padY).toBe(7);
    expect(l.w).toBe(70);
    expect(l.h).toBe(30 + 14);
    // 0.18 × min(70, 44) = 7.92 → 8, within the 6–22 clamp.
    expect(l.cornerRadius).toBe(8);
  });

  it("defaults the background padding to 14 and counts lines", () => {
    const l = textBoxLayout(
      { ...base, text: "a\nbb\nc", backgroundColor: "#000", lineHeight: 1 },
      measure,
    );
    expect(l.padX).toBe(14);
    expect(l.innerH).toBe(60);
    expect(l.innerW).toBe(20);
  });

  it("measures an empty text as one line", () => {
    const l = textBoxLayout({ ...base, text: "", lineHeight: 1 }, measure);
    expect(l.innerH).toBe(20);
  });
});

describe("textEditorOverlay", () => {
  const layout = textBoxLayout(
    { ...base, backgroundColor: "#000", bgPadding: 10, lineHeight: 1.5 },
    measure,
  );

  it("is the node box at zoom 1", () => {
    const o = textEditorOverlay(layout, 20, 1);
    expect(o.box).toEqual({ w: 70, h: 44, radius: 8 });
    expect(o.text.left).toBe(10);
    expect(o.text.top).toBe(7);
    expect(o.text.fontSize).toBe(20);
    expect(o.text.width).toBe(50 + CARET_SLACK);
    expect(o.text.height).toBe(30);
  });

  it("scales every number with the zoom and has no font-size floor", () => {
    const o = textEditorOverlay(layout, 20, 0.25);
    expect(o.box).toEqual({ w: 17.5, h: 11, radius: 2 });
    expect(o.text.left).toBe(2.5);
    expect(o.text.top).toBe(1.75);
    expect(o.text.fontSize).toBe(5);
    expect(o.text.width).toBe(12.5 + CARET_SLACK);
  });

  it("shifts the textarea so centered and right-aligned glyphs stay put", () => {
    const c = textEditorOverlay({ ...layout, align: "center" }, 20, 1);
    expect(c.text.left).toBe(10 - CARET_SLACK / 2);
    const r = textEditorOverlay({ ...layout, align: "right" }, 20, 1);
    expect(r.text.left).toBe(10 - CARET_SLACK);
  });
});

describe("textEffects (CP-0106)", () => {
  it("adds nothing to a plain annotation", () => {
    expect(textEffects(base)).toEqual({});
    expect(textEffects({ ...base, outlineColor: null, shadow: false })).toEqual({});
  });

  it("draws the outline behind the fill, twice the visible width", () => {
    expect(textEffects({ ...base, outlineColor: "#000000", outlineWidth: 4 })).toEqual({
      stroke: "#000000",
      strokeWidth: 8,
      fillAfterStrokeEnabled: true,
      lineJoin: "round",
    });
  });

  it("defaults the outline width to 3 and clamps it to 1..8", () => {
    expect(textEffects({ ...base, outlineColor: "#111" }).strokeWidth).toBe(6);
    expect(textEffects({ ...base, outlineColor: "#111", outlineWidth: 0 }).strokeWidth).toBe(2);
    expect(textEffects({ ...base, outlineColor: "#111", outlineWidth: 20 }).strokeWidth).toBe(16);
  });

  it("scales the shadow preset with the font size", () => {
    const small = textEffects({ ...base, fontSize: 16, shadow: true });
    expect(small).toEqual({
      shadowColor: "#000000",
      shadowOpacity: 0.55,
      shadowBlur: 2,
      shadowOffsetX: 1,
      shadowOffsetY: 1,
    });
    const big = textEffects({ ...base, fontSize: 100, shadow: true });
    expect(big.shadowBlur).toBe(12);
    expect(big.shadowOffsetX).toBe(5);
    expect(big.shadowOffsetY).toBe(5);
  });
});

describe("textEffectsCss (CP-0106)", () => {
  it("is empty without effects", () => {
    expect(textEffectsCss(base, 2)).toEqual({});
  });

  it("mirrors the outline at screen scale, stroke under the fill", () => {
    expect(textEffectsCss({ ...base, outlineColor: "#ff0000", outlineWidth: 2 }, 1.5)).toEqual({
      WebkitTextStroke: "6px #ff0000",
      paintOrder: "stroke fill",
    });
  });

  it("mirrors the shadow at screen scale", () => {
    expect(textEffectsCss({ ...base, fontSize: 100, shadow: true }, 0.5)).toEqual({
      textShadow: "2.5px 2.5px 6px rgba(0, 0, 0, 0.55)",
    });
  });
});
