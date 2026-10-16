import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import type { EditTemplate } from "@/lib/template";
import type { Annotation } from "@/stores/editor";
import { defaultSelection, itemsFromDoc, itemsFromTemplate } from "./pickerItems";

const rect = (id: string): Annotation =>
  ({ id, type: "rect", x: 0, y: 0, w: 5, h: 5, stroke: "#f00", strokeWidth: 2 }) as Annotation;
const blur = (id: string): Annotation =>
  ({ id, type: "blur", x: 0, y: 0, w: 5, h: 5, blurRadius: 8 }) as Annotation;

const doc = (over: object = {}) => ({
  annotations: [rect("a"), blur("b")],
  nextPinNumber: 1,
  imageCrop: null,
  backdropOn: true,
  ...over,
});

describe("pickerItems", () => {
  it("itemsFromDoc omits crop when uncropped", () => {
    const kinds = itemsFromDoc(doc(), DEFAULT_CONFIG.general.backdrop).map((i) => i.kind);
    expect(kinds).not.toContain("crop");
    expect(kinds).toContain("backdropOn");
    expect(kinds).toContain("backdropLook");
    const withCrop = itemsFromDoc(
      doc({ imageCrop: { x: 1, y: 2, w: 3, h: 4 } }),
      DEFAULT_CONFIG.general.backdrop,
    );
    expect(withCrop[0].kind).toBe("crop");
  });

  it("itemsFromTemplate omits absent fields", () => {
    const tpl: EditTemplate = {
      id: "t",
      name: "t",
      createdAt: 0,
      sourceSize: { w: 10, h: 10 },
      annotations: [rect("a")],
      thumb: "",
    };
    expect(itemsFromTemplate(tpl).map((i) => i.kind)).toEqual(["annotation"]);
    const off = itemsFromTemplate({ ...tpl, backdropOn: false });
    expect(off[0]).toEqual({ kind: "backdropOn", value: false });
  });

  it("defaultSelection leaves backdropLook unchecked", () => {
    const items = itemsFromDoc(doc(), DEFAULT_CONFIG.general.backdrop);
    const sel = defaultSelection(items);
    expect(sel.backdropLook).toBe(false);
    expect(sel.backdropOn).toBe(true);
    expect(sel.crop).toBe(false);
    expect([...sel.annotationIds]).toEqual(["b", "a"]);
  });

  it("topmost first", () => {
    const ids = itemsFromDoc(doc(), DEFAULT_CONFIG.general.backdrop)
      .flatMap((i) => (i.kind === "annotation" ? [i.id] : []));
    expect(ids).toEqual(["b", "a"]);
  });
});
