import { describe, it, expect } from "vitest";
import type { Annotation, RectAnnotation } from "@/stores/editor";
import {
  DIM_OPACITY,
  drawSpotlight,
  isSpotlight,
  spotlightHole,
  spotlightLevel,
  spotlightShapes,
} from "./spotlight";

const rect = (over: Partial<RectAnnotation> = {}): RectAnnotation => ({
  id: "r",
  type: "rect",
  x: 10,
  y: 20,
  w: 100,
  h: 50,
  stroke: "#f00",
  strokeWidth: 3,
  ...over,
});

describe("isSpotlight / spotlightShapes", () => {
  it("keeps only rects and ellipses that dim", () => {
    const anns: Annotation[] = [
      rect({ id: "a", dim: "light" }),
      rect({ id: "b" }),
      rect({ id: "c", shape: "ellipse", dim: "strong" }),
      rect({ id: "d", shape: "line", dim: "medium" }),
      { id: "e", type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#f00", strokeWidth: 2 },
    ];
    expect(spotlightShapes(anns).map((a) => a.id)).toEqual(["a", "c"]);
    expect(isSpotlight(anns[1])).toBe(false);
  });
});

describe("spotlightLevel", () => {
  it("is null when nothing dims", () => {
    expect(spotlightLevel([rect()])).toBeNull();
  });

  it("is the strongest level present (one overlay, one opacity)", () => {
    expect(spotlightLevel([rect({ dim: "light" }), rect({ dim: "medium" })])).toBe("medium");
    expect(spotlightLevel([rect({ dim: "strong" }), rect({ dim: "light" })])).toBe("strong");
  });

  it("orders the opacities light < medium < strong", () => {
    expect(DIM_OPACITY.light).toBeLessThan(DIM_OPACITY.medium);
    expect(DIM_OPACITY.medium).toBeLessThan(DIM_OPACITY.strong);
  });
});

describe("spotlightHole", () => {
  it("derives the hole from the annotation when there is no live node", () => {
    const h = spotlightHole(rect({ cornerRadius: 8, rotation: 0 }), undefined);
    expect(h).toEqual({ kind: "rect", w: 100, h: 50, cornerRadius: 8, m: [1, 0, 0, 1, 10, 20] });
  });

  it("uses the live node's transform and size while dragging / transforming", () => {
    const node = {
      width: () => 100,
      height: () => 50,
      getTransform: () => ({ getMatrix: () => [2, 0, 0, 2, 40, 60] }),
    };
    const h = spotlightHole(rect({ shape: "ellipse" }), node);
    expect(h).toEqual({ kind: "ellipse", w: 100, h: 50, cornerRadius: 0, m: [2, 0, 0, 2, 40, 60] });
  });

  it("encodes rotation in the fallback matrix", () => {
    const h = spotlightHole(rect({ x: 0, y: 0, rotation: 90 }), undefined);
    expect(h.m.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 1, -1, 0, 0, 0]);
  });
});

function mockCtx() {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : String(a))).join(",")})`);
    };
  const ctx = {
    save: rec("save"),
    restore: rec("restore"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    rect: rec("rect"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arcTo: rec("arcTo"),
    ellipse: rec("ellipse"),
    transform: rec("transform"),
    clip: rec("clip"),
    fillRect: rec("fillRect"),
    fillStyle: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("drawSpotlight", () => {
  const hole = (over = {}) => ({
    kind: "rect" as const,
    w: 10,
    h: 10,
    cornerRadius: 0,
    m: [1, 0, 0, 1, 5, 5] as const,
    ...over,
  });

  it("does nothing without holes", () => {
    const { ctx, calls } = mockCtx();
    drawSpotlight(ctx, { w: 100, h: 80, radius: 0 }, [], 0.5);
    expect(calls).toEqual([]);
  });

  it("clips to the image, intersects one even-odd clip per hole, then fills the image", () => {
    const { ctx, calls } = mockCtx();
    drawSpotlight(ctx, { w: 100, h: 80, radius: 0 }, [hole(), hole({ m: [1, 0, 0, 1, 50, 50] })], 0.55);
    expect(calls.filter((c) => c.startsWith("clip"))).toEqual(["clip()", "clip(evenodd)", "clip(evenodd)"]);
    expect(calls.at(-2)).toBe("fillRect(0,0,100,80)");
    expect(calls[0]).toBe("save()");
    expect(calls.at(-1)).toBe("restore()");
    expect(ctx.fillStyle).toBe("rgba(0,0,0,0.55)");
  });

  it("rounds the image clip when the backdrop rounds the image", () => {
    const { ctx, calls } = mockCtx();
    drawSpotlight(ctx, { w: 100, h: 80, radius: 12 }, [hole()], 0.5);
    const firstClip = calls.indexOf("clip()");
    expect(calls.slice(0, firstClip).some((c) => c.startsWith("arcTo"))).toBe(true);
  });

  it("clamps a hole's corner radius like Konva (≤ half the short side)", () => {
    const { ctx, calls } = mockCtx();
    drawSpotlight(ctx, { w: 100, h: 80, radius: 0 }, [hole({ w: 40, h: 10, cornerRadius: 60 })], 0.5);
    const arcs = calls.filter((c) => c.startsWith("arcTo"));
    expect(arcs.length).toBe(4);
    expect(arcs.every((c) => c.endsWith(",5)"))).toBe(true);
  });

  it("draws an ellipse hole inside the node's local box", () => {
    const { ctx, calls } = mockCtx();
    drawSpotlight(ctx, { w: 100, h: 80, radius: 0 }, [hole({ kind: "ellipse", w: 40, h: 20 })], 0.5);
    expect(calls).toContain("ellipse(20,10,20,10,0,0,6.28)");
    expect(calls).toContain("transform(1,0,0,1,5,5)");
  });

  it("skips a degenerate hole instead of clipping everything away", () => {
    const { ctx, calls } = mockCtx();
    drawSpotlight(ctx, { w: 100, h: 80, radius: 0 }, [hole({ w: 0 })], 0.5);
    expect(calls.filter((c) => c === "clip(evenodd)")).toEqual([]);
    expect(calls).toContain("fillRect(0,0,100,80)");
  });
});
