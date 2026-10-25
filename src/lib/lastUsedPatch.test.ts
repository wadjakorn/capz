import { describe, it, expect } from "vitest";
import { lastUsedPatchForAnnotation } from "./lastUsedPatch";

describe("lastUsedPatchForAnnotation — Shapes stroke style (CP-0076)", () => {
  it("remembers a rect/ellipse's style", () => {
    expect(
      lastUsedPatchForAnnotation({
        id: "a", type: "rect", x: 0, y: 0, w: 1, h: 1,
        stroke: "#f00", strokeWidth: 2, shape: "ellipse", strokeStyle: "dotted",
      }),
    ).toEqual({
      rect: { strokeColor: "#f00", strokeWidth: 2, shape: "ellipse", cornerRadius: undefined, strokeStyle: "dotted" },
    });
  });

  it("files a headless line under the rect slot with shape line and its style", () => {
    expect(
      lastUsedPatchForAnnotation({
        id: "l", type: "arrow", x1: 0, y1: 0, x2: 9, y2: 9,
        stroke: "#f00", strokeWidth: 2, heads: "none", dash: true,
      }),
    ).toEqual({ rect: { strokeColor: "#f00", strokeWidth: 2, shape: "line", strokeStyle: "dashed" } });
  });

  it("gives a pre-feature rect an explicit solid — the patch replaces the whole rect slot", () => {
    const patch = lastUsedPatchForAnnotation({
      id: "a", type: "rect", x: 0, y: 0, w: 1, h: 1, stroke: "#f00", strokeWidth: 2,
    });
    expect(patch.rect?.strokeStyle).toBe("solid");
  });
});
