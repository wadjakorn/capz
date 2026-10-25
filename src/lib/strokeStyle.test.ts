import { describe, it, expect } from "vitest";
import { arrowStrokeStyle, isShapesToolAnnotation, strokeDashProps } from "./strokeStyle";
import type { ArrowAnnotation, RectAnnotation } from "@/stores/editor";

const rect: RectAnnotation = {
  id: "r",
  type: "rect",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  stroke: "#f00",
  strokeWidth: 2,
};
const arrow: ArrowAnnotation = {
  id: "a",
  type: "arrow",
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 10,
  stroke: "#f00",
  strokeWidth: 2,
};

describe("strokeDashProps", () => {
  it("solid (or absent) adds nothing, so existing shapes keep their caps/joins", () => {
    expect(strokeDashProps("solid", 4)).toEqual({});
    expect(strokeDashProps(undefined, 4)).toEqual({});
  });

  it("dashed matches the existing dashed-line look", () => {
    expect(strokeDashProps("dashed", 4)).toEqual({ dash: [8, 8], lineCap: "round", lineJoin: "round" });
  });

  it("dotted draws round dots whose pitch scales with the width", () => {
    expect(strokeDashProps("dotted", 4)).toEqual({ dash: [0.001, 8], lineCap: "round", lineJoin: "round" });
    expect(strokeDashProps("dotted", 20).dash).toEqual([0.001, 40]);
  });

  it("dotted keeps a clear gap at thin widths (gap floor sw+3)", () => {
    expect(strokeDashProps("dotted", 1).dash).toEqual([0.001, 4]);
    expect(strokeDashProps("dotted", 2).dash).toEqual([0.001, 5]);
  });
});

describe("arrowStrokeStyle", () => {
  it("falls back to the legacy dash flag", () => {
    expect(arrowStrokeStyle({})).toBe("solid");
    expect(arrowStrokeStyle({ dash: true })).toBe("dashed");
    expect(arrowStrokeStyle({ dash: false })).toBe("solid");
  });

  it("prefers strokeStyle when set", () => {
    expect(arrowStrokeStyle({ dash: true, strokeStyle: "dotted" })).toBe("dotted");
    expect(arrowStrokeStyle({ dash: true, strokeStyle: "solid" })).toBe("solid");
  });
});

describe("isShapesToolAnnotation", () => {
  it("is true for rects and headless lines only", () => {
    expect(isShapesToolAnnotation(rect)).toBe(true);
    expect(isShapesToolAnnotation({ ...arrow, heads: "none" })).toBe(true);
    expect(isShapesToolAnnotation({ ...arrow, heads: "end" })).toBe(false);
    expect(isShapesToolAnnotation({ ...arrow, heads: "both" })).toBe(false);
    expect(isShapesToolAnnotation({ ...arrow, heads: undefined })).toBe(false);
    expect(isShapesToolAnnotation(null)).toBe(false);
  });
});
