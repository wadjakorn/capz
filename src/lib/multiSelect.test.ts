import { describe, it, expect } from "vitest";
import { sharedStyleKind } from "./multiSelect";
import type { Annotation } from "@/stores/editor";

const rect = (id: string) =>
  ({ id, type: "rect", x: 0, y: 0, w: 1, h: 1, stroke: "#f00", strokeWidth: 1 }) as Annotation;
const arrow = (id: string, heads?: "none") =>
  ({ id, type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#f00", strokeWidth: 1, heads }) as Annotation;
const pin = (id: string) =>
  ({ id, type: "pin", x: 0, y: 0, number: 1, color: "#f00", size: 20 }) as Annotation;

describe("sharedStyleKind (CP-0050)", () => {
  it("returns the type when every member shares it", () => {
    expect(sharedStyleKind([rect("a"), rect("b")])).toBe("rect");
    expect(sharedStyleKind([arrow("a"), arrow("b")])).toBe("arrow");
  });
  it("is null for mixed types", () => {
    expect(sharedStyleKind([rect("a"), pin("b")])).toBeNull();
  });
  it("treats a headless line and an arrow as different kinds", () => {
    expect(sharedStyleKind([arrow("a"), arrow("b", "none")])).toBeNull();
    expect(sharedStyleKind([arrow("a", "none"), arrow("b", "none")])).toBe("line");
  });
  it("is null for an empty list", () => {
    expect(sharedStyleKind([])).toBeNull();
  });
});
