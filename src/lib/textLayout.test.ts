import { describe, expect, it } from "vitest";
import type { TextAnnotation } from "@/stores/editor";
import {
  CARET_SLACK,
  textBoxLayout,
  textEditorOverlay,
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
