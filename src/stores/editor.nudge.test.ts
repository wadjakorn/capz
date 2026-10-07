import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditor,
  shiftAnnotation,
  type Annotation,
  type ArrowAnnotation,
  type RectAnnotation,
} from "./editor";

function rect(id: string, x = 0, y = 0): RectAnnotation {
  return { id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}

const find = (id: string) => useEditor.getState().annotations.find((a) => a.id === id)!;
const pos = (id: string) => {
  const a = find(id) as RectAnnotation;
  return [a.x, a.y];
};

describe("shiftAnnotation (pure)", () => {
  it("moves x/y for box-like types", () => {
    const list: Annotation[] = [
      rect("r", 5, 6),
      { id: "t", type: "text", x: 5, y: 6, text: "hi", fontSize: 12, fill: "#000" },
      { id: "s", type: "sticker", x: 5, y: 6, fontSize: 20, char: "⭐" },
      { id: "p", type: "pin", x: 5, y: 6, number: 1, color: "#f00", size: 20 },
      { id: "b", type: "blur", x: 5, y: 6, w: 4, h: 4, blurRadius: 3 },
      { id: "i", type: "image", x: 5, y: 6, w: 4, h: 4, src: "data:" },
    ];
    for (const a of list) {
      const n = shiftAnnotation(a, 2, -3) as { x: number; y: number };
      expect([n.x, n.y]).toEqual([7, 3]);
    }
  });

  it("moves both arrow endpoints and the curve control only when present", () => {
    const straight: ArrowAnnotation = {
      id: "a", type: "arrow", x1: 0, y1: 0, x2: 10, y2: 10, stroke: "#f00", strokeWidth: 2,
    };
    const s = shiftAnnotation(straight, 1, 2) as ArrowAnnotation;
    expect([s.x1, s.y1, s.x2, s.y2]).toEqual([1, 2, 11, 12]);
    expect("cx" in s).toBe(false);
    const curved = shiftAnnotation({ ...straight, cx: 5, cy: 0 }, 1, 2) as ArrowAnnotation;
    expect([curved.cx, curved.cy]).toEqual([6, 2]);
  });

  it("moves every point of pen/highlighter paths", () => {
    const pen = shiftAnnotation(
      { id: "p", type: "pen", points: [0, 0, 4, 5], stroke: "#000", strokeWidth: 2, mode: "raw" },
      1,
      -1,
    );
    expect((pen as { points: number[] }).points).toEqual([1, -1, 5, 4]);
    const hl = shiftAnnotation(
      { id: "h", type: "highlighter", points: [2, 2], stroke: "#ff0", strokeWidth: 8 },
      10,
      0,
    );
    expect((hl as { points: number[] }).points).toEqual([12, 2]);
  });

  it("moves magnify source and loupe together", () => {
    const m = shiftAnnotation(
      {
        id: "m", type: "magnify", sx: 10, sy: 10, srw: 5, srh: 5, x: 50, y: 50,
        zoom: 2, shape: "circle", stroke: "#000", strokeWidth: 2,
      },
      1,
      1,
    ) as { sx: number; sy: number; x: number; y: number };
    expect([m.sx, m.sy, m.x, m.y]).toEqual([11, 11, 51, 51]);
  });
});

describe("store nudge action", () => {
  beforeEach(() => {
    useEditor.getState().reset();
    useEditor.setState({ annotations: [rect("a", 10, 10), rect("b", 50, 50)], past: [], future: [] });
  });

  it("moves the element and pushes one history entry", () => {
    useEditor.setState({ future: [{ annotations: [], nextPinNumber: 1, imageCrop: null }] });
    useEditor.getState().nudge("a", 1, 0, 1000);
    expect(pos("a")).toEqual([11, 10]);
    expect(pos("b")).toEqual([50, 50]);
    expect(useEditor.getState().past).toHaveLength(1);
    expect(useEditor.getState().future).toHaveLength(0);
  });

  it("coalesces a quick run into a single undo step", () => {
    const { nudge } = useEditor.getState();
    nudge("a", 1, 0, 1000);
    nudge("a", 1, 0, 1030);
    nudge("a", 0, 10, 1900);
    nudge("a", 0, 10, 2800);
    expect(pos("a")).toEqual([12, 30]);
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(pos("a")).toEqual([10, 10]);
  });

  it("starts a new undo step after an idle gap", () => {
    const { nudge } = useEditor.getState();
    nudge("a", 1, 0, 1000);
    nudge("a", 1, 0, 2001);
    expect(useEditor.getState().past).toHaveLength(2);
    useEditor.getState().undo();
    expect(pos("a")).toEqual([11, 10]);
  });

  it("starts a new undo step after any other edit", () => {
    useEditor.getState().nudge("a", 1, 0, 1000);
    useEditor.getState().update("b", { stroke: "#00f" });
    useEditor.getState().nudge("a", 1, 0, 1010);
    expect(useEditor.getState().past).toHaveLength(3);
    useEditor.getState().undo();
    expect(pos("a")).toEqual([11, 10]);
  });

  it("starts a new undo step when a different element is nudged", () => {
    useEditor.getState().nudge("a", 1, 0, 1000);
    useEditor.getState().nudge("b", 1, 0, 1010);
    expect(useEditor.getState().past).toHaveLength(2);
  });

  it("starts a fresh run after undo", () => {
    useEditor.getState().nudge("a", 1, 0, 1000);
    useEditor.getState().undo();
    useEditor.getState().nudge("a", 1, 0, 1010);
    expect(pos("a")).toEqual([11, 10]);
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(pos("a")).toEqual([10, 10]);
  });

  it("ignores unknown ids and zero deltas", () => {
    const before = useEditor.getState().annotations;
    useEditor.getState().nudge("zzz", 1, 0, 1000);
    useEditor.getState().nudge("a", 0, 0, 1000);
    expect(useEditor.getState().annotations).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
  });
});
