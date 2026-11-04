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
      rect: { strokeColor: "#f00", strokeWidth: 2, shape: "ellipse", cornerRadius: undefined, strokeStyle: "dotted", dim: false },
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

describe("lastUsedPatchForAnnotation — spotlight dim (CP-0095)", () => {
  const base = { id: "a", type: "rect" as const, x: 0, y: 0, w: 9, h: 9, stroke: "#f00", strokeWidth: 2 };

  it("remembers dim on with its level", () => {
    expect(lastUsedPatchForAnnotation({ ...base, dim: "strong" }).rect).toMatchObject({
      dim: true,
      dimLevel: "strong",
    });
  });

  it("remembers dim off WITHOUT a dimLevel key — slots merge field by field, so undefined would wipe the remembered level", () => {
    const rect = lastUsedPatchForAnnotation(base).rect!;
    expect(rect.dim).toBe(false);
    expect("dimLevel" in rect).toBe(false);
  });

  it("a headless line does not touch the dim fields", () => {
    const rect = lastUsedPatchForAnnotation({
      id: "l", type: "arrow", x1: 0, y1: 0, x2: 9, y2: 9, stroke: "#f00", strokeWidth: 2, heads: "none",
    }).rect!;
    expect("dim" in rect || "dimLevel" in rect).toBe(false);
  });
});
