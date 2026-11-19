import { describe, expect, it } from "vitest";
import { selectedShapeKind, shapePickerForSelection } from "./shapePicker";
import type { Annotation } from "@/stores/editor";

const box = (id: string, shape?: "rect" | "ellipse") =>
  ({ id, type: "rect", x: 0, y: 0, w: 1, h: 1, stroke: "#f00", strokeWidth: 1, shape }) as Annotation;
const line = (id: string) =>
  ({ id, type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#f00", strokeWidth: 1, heads: "none" }) as Annotation;
const arrow = (id: string) =>
  ({ id, type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#f00", strokeWidth: 1, heads: "end" }) as Annotation;

describe("selectedShapeKind (CP-0102)", () => {
  it("reads the rendered shape of a box", () => {
    expect(selectedShapeKind(box("a", "ellipse"))).toBe("ellipse");
    expect(selectedShapeKind(box("a", "rect"))).toBe("rect");
    // No `shape` renders as a rectangle.
    expect(selectedShapeKind(box("a"))).toBe("rect");
  });
  it("treats a headless arrow as a line and a real arrow as no shape", () => {
    expect(selectedShapeKind(line("a"))).toBe("line");
    expect(selectedShapeKind(arrow("a"))).toBeNull();
  });
});

describe("shapePickerForSelection (CP-0102)", () => {
  it("highlights the primary (last) box and disables line", () => {
    expect(shapePickerForSelection([box("a", "rect"), box("b", "ellipse")])).toEqual({
      value: "ellipse",
      disabled: ["line"],
    });
  });
  it("disables rect and circle for lines", () => {
    expect(shapePickerForSelection([line("a")])).toEqual({ value: "line", disabled: ["rect", "ellipse"] });
  });
  it("is null for a mix of lines and boxes, non-shapes, or nothing", () => {
    expect(shapePickerForSelection([box("a"), line("b")])).toBeNull();
    expect(shapePickerForSelection([box("a"), arrow("b")])).toBeNull();
    expect(shapePickerForSelection([])).toBeNull();
  });
});
