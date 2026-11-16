import { describe, expect, it } from "vitest";
import type { OcrLine, OcrWord } from "@/lib/ocr";
import {
  MIN_SCOPE_PX,
  isScopeTooSmall,
  lineWords,
  pointInRect,
  rectFromPoints,
  scopeLines,
} from "@/lib/ocrScope";

const w = (text: string, x: number, y: number, ww: number, h: number): OcrWord => ({
  text,
  bbox: { x, y, w: ww, h },
});

const helloW = w("Hello", 0, 0, 50, 20);
const big = w("big", 60, 0, 30, 20);
const world = w("world", 100, 0, 50, 20);
const hello: OcrLine = {
  text: "Hello big world",
  bbox: { x: 0, y: 0, w: 150, h: 20 },
  words: [helloW, big, world],
};

const box = (text: string, x: number, y: number, ww: number, h: number): OcrLine => ({
  text,
  bbox: { x, y, w: ww, h },
  words: [],
});

describe("rectFromPoints", () => {
  it("normalizes a reversed drag and clamps it to the image", () =>
    expect(rectFromPoints({ x: 300, y: 200 }, { x: -10, y: 50 }, 800, 600)).toEqual({
      x: 0,
      y: 50,
      w: 300,
      h: 150,
    }));

  it("clamps past the bottom-right edge", () =>
    expect(rectFromPoints({ x: 700, y: 500 }, { x: 900, y: 650 }, 800, 600)).toEqual({
      x: 700,
      y: 500,
      w: 100,
      h: 100,
    }));
});

describe("isScopeTooSmall", () => {
  it("treats a box under 8 image px as too small", () => {
    expect(MIN_SCOPE_PX).toBe(8);
    expect(isScopeTooSmall({ x: 0, y: 0, w: 7.9, h: 100 })).toBe(true);
    expect(isScopeTooSmall({ x: 0, y: 0, w: 100, h: 7.9 })).toBe(true);
    expect(isScopeTooSmall({ x: 0, y: 0, w: 8, h: 8 })).toBe(false);
  });
});

describe("pointInRect", () => {
  it("is inclusive of the edges", () => {
    const r = { x: 10, y: 10, w: 20, h: 20 };
    expect(pointInRect({ x: 10, y: 30 }, r)).toBe(true);
    expect(pointInRect({ x: 20, y: 20 }, r)).toBe(true);
    expect(pointInRect({ x: 31, y: 20 }, r)).toBe(false);
    expect(pointInRect({ x: 20, y: 9 }, r)).toBe(false);
  });
});

describe("lineWords", () => {
  it("returns the line's words when they cover its text", () =>
    expect(lineWords(hello)).toBe(hello.words));

  it("collapses whitespace before comparing", () => {
    const line: OcrLine = { ...hello, text: " Hello  big\tworld " };
    expect(lineWords(line)).toBe(line.words);
  });

  it("falls back to one word for a line without word boxes", () =>
    expect(lineWords(box("Solo", 5, 5, 40, 10))).toEqual([
      { text: "Solo", bbox: { x: 5, y: 5, w: 40, h: 10 } },
    ]));

  it("falls back to one word when the words don't cover the text", () => {
    const line: OcrLine = { ...hello, words: [helloW, world] };
    expect(lineWords(line)).toEqual([{ text: line.text, bbox: line.bbox }]);
  });
});

describe("scopeLines", () => {
  it("keeps words whose centre is inside and rebuilds the line", () =>
    expect(scopeLines([hello], { x: 55, y: 0, w: 145, h: 20 })).toEqual([
      { text: "big world", bbox: { x: 60, y: 0, w: 90, h: 20 }, words: [big, world] },
    ]));

  it("keeps a word whose box the edge cuts, as long as its centre is inside", () =>
    // big centre x = 75: box from x=70 cuts big but keeps it whole
    expect(scopeLines([hello], { x: 70, y: 0, w: 200, h: 20 })[0].text).toBe("big world"));

  it("returns the original line object when every word is in scope", () =>
    expect(scopeLines([hello], { x: 0, y: 0, w: 200, h: 40 })[0]).toBe(hello));

  it("drops a line with no word inside", () =>
    expect(scopeLines([hello], { x: 300, y: 0, w: 50, h: 50 })).toEqual([]));

  it("treats a line without word boxes as one word", () => {
    const solo = box("Solo", 0, 0, 40, 10); // centre (20, 5)
    expect(scopeLines([solo], { x: 10, y: 0, w: 20, h: 10 })).toEqual([solo]);
    expect(scopeLines([solo], { x: 25, y: 0, w: 20, h: 10 })).toEqual([]);
  });

  it("falls back to the whole line when words don't cover its text", () => {
    // Vision skipped "big": text "Hello big world", words [Hello, world].
    const skipped: OcrLine = { ...hello, words: [helloW, world] };
    // Covers only world's centre (125,10) — the line centre (75,10) is outside.
    expect(scopeLines([skipped], { x: 110, y: 0, w: 40, h: 20 })).toEqual([]);
    // Covers the line centre — kept whole, never rebuilt as "world".
    expect(scopeLines([skipped], { x: 70, y: 0, w: 80, h: 20 })).toEqual([skipped]);
  });

  it("orders rows top-down and lines within a row left-to-right", () => {
    const a = box("A", 400, 100, 100, 30);
    const b = box("B", 0, 104, 100, 30);
    const c = box("C", 0, 160, 100, 30);
    const all = { x: 0, y: 0, w: 800, h: 600 };
    expect(scopeLines([a, b, c], all).map((l) => l.text)).toEqual(["B", "A", "C"]);
    expect(scopeLines([c, a, b], all).map((l) => l.text)).toEqual(["B", "A", "C"]);
  });

  it("keeps column order for a two-column page", () => {
    const lines = [
      box("Left one", 40, 100, 200, 30),
      box("Right one", 440, 100, 200, 30),
      box("Left two", 40, 160, 200, 30),
      box("Right two", 440, 160, 200, 30),
    ];
    expect(
      scopeLines(lines, { x: 20, y: 80, w: 340, h: 140 }).map((l) => l.text),
    ).toEqual(["Left one", "Left two"]);
  });
});
