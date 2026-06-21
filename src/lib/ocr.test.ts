import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { detectText, ocrBoxStyle, computeFitScaleX } from "./ocr";

beforeEach(() => invoke.mockReset());

describe("ocrBoxStyle", () => {
  it("scales an image-space box to screen pixels", () => {
    const s = ocrBoxStyle({ x: 10, y: 20, w: 100, h: 30 }, 2);
    expect(s).toEqual({ left: 20, top: 40, width: 200, height: 60, fontSize: 60 });
  });
});

describe("detectText", () => {
  it("invokes ocr_detect with the path", async () => {
    const fake = { width: 1, height: 1, lines: [], languagesUsed: ["en-US"], thaiAvailable: true };
    invoke.mockResolvedValue(fake);
    const r = await detectText("/tmp/x.png");
    expect(invoke).toHaveBeenCalledWith("ocr_detect", { path: "/tmp/x.png" });
    expect(r).toBe(fake);
  });
});

describe("computeFitScaleX", () => {
  const m = (w: number) => () => w; // measurer returning a fixed width
  it("returns boxW / measuredWidth", () => {
    expect(computeFitScaleX("hi", 10, 100, m(50))).toBe(2);
  });
  it("clamps to a max of 10", () => {
    expect(computeFitScaleX("hi", 10, 1000, m(50))).toBe(10);
  });
  it("clamps to a min of 0.1", () => {
    expect(computeFitScaleX("hi", 10, 5, m(100))).toBe(0.1);
  });
  it("falls back to 1 when measure returns 0", () => {
    expect(computeFitScaleX("hi", 10, 100, m(0))).toBe(1);
  });
  it("falls back to 1 when measure returns NaN", () => {
    expect(computeFitScaleX("hi", 10, 100, m(NaN))).toBe(1);
  });
});
