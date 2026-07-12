import { describe, it, expect, beforeEach } from "vitest";
import { useEditor, type RectAnnotation, type ArrowAnnotation } from "./editor";

const SRC = { w: 100, h: 80 };

function rect(id: string, x: number, y: number): RectAnnotation {
  return { id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}
function arrow(id: string): ArrowAnnotation {
  return { id, type: "arrow", x1: 10, y1: 10, x2: 30, y2: 40, stroke: "#f00", strokeWidth: 2 };
}

beforeEach(() => {
  useEditor.getState().reset();
});

describe("applyCrop", () => {
  it("sets the crop rect and shifts annotations into the new origin", () => {
    useEditor.getState().add(rect("r1", 20, 15));
    useEditor.getState().applyCrop({ x: 10, y: 5, w: 50, h: 40 }, SRC);

    expect(useEditor.getState().imageCrop).toEqual({ x: 10, y: 5, w: 50, h: 40 });
    const r = useEditor.getState().annotations[0] as RectAnnotation;
    expect(r.x).toBe(10); // 20 - 10
    expect(r.y).toBe(10); // 15 - 5
  });

  it("shifts arrow endpoints too", () => {
    useEditor.getState().add(arrow("a1"));
    useEditor.getState().applyCrop({ x: 5, y: 5, w: 40, h: 40 }, SRC);
    const a = useEditor.getState().annotations[0] as ArrowAnnotation;
    expect([a.x1, a.y1, a.x2, a.y2]).toEqual([5, 5, 25, 35]);
  });

  it("shifts an arrow's mid curve-control point too", () => {
    useEditor.getState().add({ ...arrow("a1"), cx: 20, cy: 25 });
    useEditor.getState().applyCrop({ x: 5, y: 5, w: 40, h: 40 }, SRC);
    const a = useEditor.getState().annotations[0] as ArrowAnnotation;
    expect([a.cx, a.cy]).toEqual([15, 20]);
  });

  it("shifts freehand path points into the new origin", () => {
    useEditor.getState().add({
      id: "f1",
      type: "pen",
      points: [10, 10, 20, 30],
      stroke: "#f00",
      strokeWidth: 4,
      mode: "raw",
    });
    useEditor.getState().applyCrop({ x: 5, y: 5, w: 40, h: 40 }, SRC);
    const a = useEditor.getState().annotations[0];
    expect(a.type === "pen" && a.points).toEqual([5, 5, 15, 25]);
  });

  it("shifts a magnifier's source and output centers", () => {
    useEditor.getState().add({
      id: "mg1",
      type: "magnify",
      sx: 20,
      sy: 20,
      srw: 10,
      srh: 10,
      x: 40,
      y: 30,
      zoom: 2,
      shape: "circle",
      stroke: "#facc15",
      strokeWidth: 3,
    });
    useEditor.getState().applyCrop({ x: 5, y: 5, w: 40, h: 40 }, SRC);
    const a = useEditor.getState().annotations[0];
    expect(a.type === "magnify" && [a.sx, a.sy, a.x, a.y]).toEqual([
      15, 15, 35, 25,
    ]);
  });

  it("composes a second crop onto the first (source-relative)", () => {
    useEditor.getState().applyCrop({ x: 10, y: 5, w: 50, h: 40 }, SRC);
    useEditor.getState().applyCrop({ x: 5, y: 5, w: 20, h: 20 }, SRC);
    expect(useEditor.getState().imageCrop).toEqual({ x: 15, y: 10, w: 20, h: 20 });
  });

  it("clamps a selection that overflows the current image", () => {
    useEditor.getState().applyCrop({ x: -5, y: -5, w: 999, h: 999 }, SRC);
    expect(useEditor.getState().imageCrop).toEqual({ x: 0, y: 0, w: 100, h: 80 });
  });

  it("switches back to the select tool and re-arms the fit sentinel", () => {
    useEditor.getState().setTool("crop");
    useEditor.setState({ displayScale: 2 });
    useEditor.getState().applyCrop({ x: 10, y: 10, w: 40, h: 40 }, SRC);
    expect(useEditor.getState().tool).toBe("select");
    expect(useEditor.getState().displayScale).toBe(0);
  });

  it("undo restores the pre-crop image and annotation positions in one step", () => {
    useEditor.getState().add(rect("r1", 20, 15));
    useEditor.getState().applyCrop({ x: 10, y: 5, w: 50, h: 40 }, SRC);
    useEditor.getState().undo();

    expect(useEditor.getState().imageCrop).toBeNull();
    const r = useEditor.getState().annotations[0] as RectAnnotation;
    expect(r.x).toBe(20);
    expect(r.y).toBe(15);
  });

  it("redo re-applies the crop", () => {
    useEditor.getState().add(rect("r1", 20, 15));
    useEditor.getState().applyCrop({ x: 10, y: 5, w: 50, h: 40 }, SRC);
    useEditor.getState().undo();
    useEditor.getState().redo();

    expect(useEditor.getState().imageCrop).toEqual({ x: 10, y: 5, w: 50, h: 40 });
    expect((useEditor.getState().annotations[0] as RectAnnotation).x).toBe(10);
  });

  it("keeps the crop across a subsequent annotation edit and its undo", () => {
    useEditor.getState().applyCrop({ x: 10, y: 5, w: 50, h: 40 }, SRC);
    useEditor.getState().add(rect("r2", 5, 5));
    useEditor.getState().undo(); // undo the add only
    expect(useEditor.getState().imageCrop).toEqual({ x: 10, y: 5, w: 50, h: 40 });
  });

  it("reset clears the crop", () => {
    useEditor.getState().applyCrop({ x: 10, y: 5, w: 50, h: 40 }, SRC);
    useEditor.getState().reset();
    expect(useEditor.getState().imageCrop).toBeNull();
  });
});
