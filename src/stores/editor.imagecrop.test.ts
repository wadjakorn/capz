import { describe, it, expect, beforeEach } from "vitest";
import { useEditor, type ImageAnnotation } from "./editor";

const NAT = { w: 200, h: 100 };

function imageAnn(over: Partial<ImageAnnotation> = {}): ImageAnnotation {
  return {
    id: "img1",
    type: "image",
    x: 50,
    y: 30,
    w: 200,
    h: 100,
    src: "data:image/png;base64,AAAA",
    ...over,
  };
}

beforeEach(() => {
  useEditor.getState().reset();
});

describe("applyImageCrop", () => {
  it("maps a display selection into source natural pixels (1:1 scale)", () => {
    useEditor.getState().add(imageAnn());
    // Box is 200×100 showing the full 200×100 bitmap → scale 1:1.
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect(a.crop).toEqual({ x: 20, y: 10, w: 80, h: 40 });
  });

  it("accounts for box-vs-source scale when the image is displayed scaled", () => {
    // 200×100 bitmap shown in a 100×50 box → source is 2× the display.
    useEditor.getState().add(imageAnn({ w: 100, h: 50 }));
    useEditor.getState().applyImageCrop("img1", { x: 10, y: 5, w: 40, h: 20 }, NAT);
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect(a.crop).toEqual({ x: 20, y: 10, w: 80, h: 40 });
  });

  it("trims the box to the kept region and shifts its origin", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect([a.x, a.y, a.w, a.h]).toEqual([70, 40, 80, 40]); // 50+20, 30+10
  });

  it("composes a second crop onto an existing one (no drift)", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    // Now the box is 80×40 showing source [20,10,80,40]; crop again.
    useEditor.getState().applyImageCrop("img1", { x: 10, y: 5, w: 40, h: 20 }, NAT);
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect(a.crop).toEqual({ x: 30, y: 15, w: 40, h: 20 }); // 20+10, 10+5
  });

  it("clamps a selection that overflows the display box", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().applyImageCrop("img1", { x: -10, y: -10, w: 999, h: 999 }, NAT);
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect(a.crop).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it("switches to the select tool and keeps the image selected", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().setTool("crop");
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    expect(useEditor.getState().tool).toBe("select");
    expect(useEditor.getState().selectedId).toBe("img1");
  });

  it("is one undo step that restores the pre-crop box and crop", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    useEditor.getState().undo();
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect(a.crop).toBeUndefined();
    expect([a.x, a.y, a.w, a.h]).toEqual([50, 30, 200, 100]);
  });

  it("redo re-applies the per-object crop", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    useEditor.getState().undo();
    useEditor.getState().redo();
    const a = useEditor.getState().annotations[0] as ImageAnnotation;
    expect(a.crop).toEqual({ x: 20, y: 10, w: 80, h: 40 });
  });

  it("is a no-op for a non-image annotation id", () => {
    useEditor.getState().add({
      id: "r1",
      type: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      stroke: "#f00",
      strokeWidth: 2,
    });
    const before = useEditor.getState().annotations[0];
    useEditor.getState().applyImageCrop("r1", { x: 1, y: 1, w: 5, h: 5 }, NAT);
    expect(useEditor.getState().annotations[0]).toBe(before);
  });

  it("leaves the base imageCrop untouched", () => {
    useEditor.getState().add(imageAnn());
    useEditor.getState().applyImageCrop("img1", { x: 20, y: 10, w: 80, h: 40 }, NAT);
    expect(useEditor.getState().imageCrop).toBeNull();
  });
});
