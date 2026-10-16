import { describe, it, expect } from "vitest";
import { annotationAABB } from "@/lib/annotationBounds";
import { DEFAULT_CONFIG } from "@/lib/config";
import {
  applyTemplate,
  captureTemplate,
  imageAnnotationBytes,
  pickBackdropLook,
  templateBytes,
  templateItemCount,
  type ApplyTarget,
  type TemplateSelection,
} from "@/lib/template";
import type { Annotation, ImageCrop } from "@/stores/editor";

const rect = (id: string, x: number, y: number, w: number, h: number): Annotation =>
  ({ id, type: "rect", x, y, w, h, stroke: "#f00", strokeWidth: 2 }) as unknown as Annotation;
const pin = (id: string, x: number, y: number, number: number): Annotation =>
  ({ id, type: "pin", x, y, number }) as unknown as Annotation;
const arrow = (id: string, x1: number, y1: number, x2: number, y2: number): Annotation =>
  ({ id, type: "arrow", x1, y1, x2, y2, stroke: "#f00", strokeWidth: 2 }) as unknown as Annotation;

const SRC = { w: 1000, h: 800 };
const backdrop = DEFAULT_CONFIG.general.backdrop;
const meta = { id: "t1", name: "T", createdAt: 1, thumb: "data:," };
const doc = (annotations: Annotation[], imageCrop: ImageCrop | null = null, nextPinNumber = 1, backdropOn = true): ApplyTarget => ({
  annotations,
  nextPinNumber,
  imageCrop,
  backdropOn,
});
const sel = (ids: string[], o: Partial<TemplateSelection> = {}): TemplateSelection => ({
  crop: false,
  backdropOn: false,
  backdropLook: false,
  annotationIds: new Set(ids),
  ...o,
});
const pos = (a: Annotation) => {
  const b = annotationAABB(a)!;
  return [b.x, b.y];
};
const tplOf = (anns: Annotation[], crop: ImageCrop | null, extra: Partial<TemplateSelection> = {}) =>
  captureTemplate(doc(anns, crop), SRC, backdrop, sel(anns.map((a) => a.id), { crop: !!crop, ...extra }), meta);

describe("captureTemplate", () => {
  it("normalises to base space and keeps ids", () => {
    const t = captureTemplate(
      doc([rect("a", 10, 10, 20, 20)], { x: 100, y: 50, w: 500, h: 400 }),
      SRC, backdrop, sel(["a"]), meta,
    );
    expect(t.annotations[0].id).toBe("a");
    expect(pos(t.annotations[0])).toEqual([110, 60]);
  });

  it("includes only selected items", () => {
    const d = doc([rect("a", 0, 0, 5, 5), rect("b", 0, 0, 5, 5)], { x: 1, y: 1, w: 10, h: 10 }, 1, false);
    const t = captureTemplate(d, SRC, backdrop, sel(["a"], { backdropOn: true }), meta);
    expect(t.crop).toBeUndefined();
    expect(t.backdropOn).toBe(false);
    expect(t.backdropLook).toBeUndefined();
    expect(t.annotations).toHaveLength(1);
  });

  it("deep-copies", () => {
    const d = doc([rect("a", 10, 10, 20, 20)], { x: 0, y: 0, w: 10, h: 10 });
    const t = captureTemplate(d, SRC, backdrop, sel(["a"], { crop: true, backdropLook: true }), meta);
    (t.annotations[0] as unknown as { x: number }).x = 999;
    t.crop!.x = 5;
    t.backdropLook!.padding = 12345;
    expect((d.annotations[0] as unknown as { x: number }).x).toBe(10);
    expect(d.imageCrop!.x).toBe(0);
    expect(backdrop.padding).not.toBe(12345);
  });
});

describe("pickBackdropLook", () => {
  it("excludes every autoFor* key", () => {
    const b = { ...backdrop, autoForFull: true, autoForArea: true, autoForWindow: true, autoForPaste: true, autoForImport: true };
    expect(Object.keys(pickBackdropLook(b)).sort()).toEqual(
      ["cornerRadius", "padding", "presetId", "shadow", "solidColor", "style"],
    );
  });
});

describe("applyTemplate", () => {
  const TC = { x: 100, y: 50, w: 500, h: 400 };

  it("applies crop to uncropped target and rebases existing", () => {
    const t = tplOf([rect("a", 150, 100, 20, 20)], TC);
    const r = applyTemplate(doc([rect("e", 300, 200, 10, 10)]), t, sel(["a"], { crop: true }), SRC);
    expect(r.patch.imageCrop).toEqual(TC);
    expect(pos(r.patch.annotations[0])).toEqual([200, 150]);
    expect(r.patch.cropChanged).toBe(true);
  });

  it("replaces a different target crop, rebasing by old - new", () => {
    const t = tplOf([rect("a", 150, 100, 20, 20)], TC);
    const target = doc([rect("e", 300, 200, 10, 10)], { x: 0, y: 0, w: 600, h: 600 });
    const r = applyTemplate(target, t, sel(["a"], { crop: true }), SRC);
    expect(pos(r.patch.annotations[0])).toEqual([200, 150]);
  });

  it("crop that does not fit has no effect", () => {
    const t = tplOf([rect("a", 150, 100, 20, 20)], TC);
    const r = applyTemplate(doc([]), t, sel(["a"], { crop: true }), { w: 400, h: 300 });
    expect(r.patch.imageCrop).toBeNull();
    expect(r.cropSkipped).toBe(true);
    expect(r.patch.cropChanged).toBe(false);
  });

  it("same size + same working area: overhang kept", () => {
    const t = tplOf([rect("a", -20, 10, 50, 50)], null);
    const r = applyTemplate(doc([]), t, sel(["a"]), SRC);
    expect(pos(r.patch.annotations[0])).toEqual([-20, 10]);
  });

  it("same size, different target crop, crop unchecked: fully-outside moved in", () => {
    const t = tplOf([rect("a", 10, 10, 50, 50)], null);
    const r = applyTemplate(doc([], { x: 600, y: 0, w: 400, h: 800 }), t, sel(["a"]), SRC);
    const b = annotationAABB(r.patch.annotations[0])!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(400);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h).toBeLessThanOrEqual(800);
  });

  it("smaller target: only fully-outside move", () => {
    const t = tplOf([rect("a", 600, 100, 50, 50), rect("b", 480, 100, 50, 50)], null);
    const r = applyTemplate(doc([]), t, sel(["a", "b"]), { w: 500, h: 400 });
    const [a, b] = r.patch.annotations.map((x) => annotationAABB(x)!);
    expect(a.x + a.w).toBeLessThanOrEqual(500);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect([b.x, b.y]).toEqual([480, 100]);
  });

  it("zero-width arrow fully outside is moved; touching edge is not", () => {
    const t = tplOf([arrow("out", 700, 10, 700, 90), arrow("edge", 500, 10, 500, 90)], null);
    const r = applyTemplate(doc([]), t, sel(["out", "edge"]), { w: 500, h: 400 });
    const [o, e] = r.patch.annotations.map((x) => annotationAABB(x)!);
    expect(o.x).toBeLessThanOrEqual(500);
    expect(o.x).toBeGreaterThanOrEqual(0);
    expect(e.x).toBe(500);
  });

  it("pins keep numbers", () => {
    const t = tplOf([pin("p1", 10, 10, 1), pin("p2", 30, 10, 2)], null);
    const r = applyTemplate(doc([], null, 5), t, sel(["p1", "p2"]), SRC);
    expect(r.patch.annotations.map((a) => (a as unknown as { number: number }).number)).toEqual([1, 2]);
    expect(r.patch.nextPinNumber).toBe(5);
    expect(r.patch.maxPinNumber).toBe(2);
    expect(applyTemplate(doc([], null, 1), t, sel(["p1", "p2"]), SRC).patch.nextPinNumber).toBe(3);
  });

  it("self-apply: count doubles, all ids unique", () => {
    const anns = [rect("a", 10, 10, 5, 5), rect("b", 30, 30, 5, 5)];
    const t = tplOf(anns, null);
    const r = applyTemplate(doc(anns), t, sel(["a", "b"]), SRC);
    expect(r.patch.annotations).toHaveLength(4);
    expect(new Set(r.patch.annotations.map((a) => a.id)).size).toBe(4);
  });

  it("backdropOn false is applied when selected; kept when not", () => {
    const t = captureTemplate(doc([rect("a", 1, 1, 5, 5)], null, 1, false), SRC, backdrop, sel(["a"], { backdropOn: true }), meta);
    expect(applyTemplate(doc([], null, 1, true), t, sel(["a"], { backdropOn: true }), SRC).patch.backdropOn).toBe(false);
    expect(applyTemplate(doc([], null, 1, true), t, sel(["a"]), SRC).patch.backdropOn).toBe(true);
  });

  it("round trip", () => {
    const crop = { x: 100, y: 50, w: 500, h: 400 };
    const t = captureTemplate(doc([rect("a", 10, 20, 30, 30)], crop), SRC, backdrop, sel(["a"]), meta);
    const r = applyTemplate(doc([]), t, sel(["a"]), SRC);
    expect(pos(r.patch.annotations[0])).toEqual([110, 70]);
  });

  it.each([
    [2, true],
    [2.03, true],
    [0.5, true],
    [1.5, false],
  ])("scaleMismatch %s", (k, expected) => {
    const t = tplOf([rect("a", 1, 1, 5, 5)], null);
    const r = applyTemplate(doc([]), t, sel(["a"]), { w: SRC.w * k, h: SRC.h * k });
    expect(r.scaleMismatch).toBe(expected);
  });

  it("annotation subset", () => {
    const t = tplOf([rect("a", 1, 1, 5, 5), rect("b", 9, 9, 5, 5)], null);
    const r = applyTemplate(doc([]), t, sel(["b"]), SRC);
    expect(r.patch.annotations).toHaveLength(1);
    expect(pos(r.patch.annotations[0])).toEqual([9, 9]);
  });
});

describe("template sizing", () => {
  it("counts items and bytes", () => {
    const img = { id: "i", type: "image", x: 0, y: 0, w: 5, h: 5, src: "data:abcdef" } as unknown as Annotation;
    const t = captureTemplate(doc([img, rect("a", 0, 0, 1, 1)], { x: 0, y: 0, w: 5, h: 5 }), SRC, backdrop,
      sel(["i", "a"], { crop: true, backdropOn: true, backdropLook: true }), meta);
    expect(templateItemCount(t)).toBe(5);
    expect(imageAnnotationBytes(t)).toBe("data:abcdef".length);
    expect(templateBytes(t)).toBe(JSON.stringify(t).length);
  });
});
