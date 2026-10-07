import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditor,
  cloneAnnotation,
  type Annotation,
  type ArrowAnnotation,
  type FreehandAnnotation,
  type ImageAnnotation,
  type PinAnnotation,
  type RectAnnotation,
} from "./editor";

function rect(id: string, x = 0, y = 0): RectAnnotation {
  return { id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}
function pin(id: string, number: number): PinAnnotation {
  return { id, type: "pin", x: 50, y: 50, number, color: "#f00", size: 24, shape: "bubble" };
}
function image(id: string): ImageAnnotation {
  return {
    id,
    type: "image",
    x: 5,
    y: 5,
    w: 20,
    h: 20,
    src: "data:image/png;base64,AAAA",
    crop: { x: 1, y: 2, w: 3, h: 4 },
  };
}
const ids = (list: Annotation[]) => list.map((a) => a.id);

function load(annotations: Annotation[], nextPinNumber = 1) {
  useEditor.setState({
    annotations,
    nextPinNumber,
    selectedId: null,
    past: [],
    future: [],
    imageCrop: null,
    tool: "select",
  });
}

describe("cloneAnnotation (pure)", () => {
  it("assigns the new id and shifts position", () => {
    const c = cloneAnnotation(rect("a", 3, 4), "b", 10, 10) as RectAnnotation;
    expect(c.id).toBe("b");
    expect([c.x, c.y, c.w, c.h]).toEqual([13, 14, 10, 10]);
  });

  it("deep-clones pen points (no shared array)", () => {
    const src: FreehandAnnotation = {
      id: "p",
      type: "pen",
      points: [0, 0, 5, 5],
      stroke: "#000",
      strokeWidth: 3,
      mode: "raw",
    };
    const c = cloneAnnotation(src, "q", 10, 20) as FreehandAnnotation;
    expect(c.points).toEqual([10, 20, 15, 25]);
    expect(c.points).not.toBe(src.points);
    expect(src.points).toEqual([0, 0, 5, 5]);
  });

  it("shifts arrow endpoints and curve control", () => {
    const src: ArrowAnnotation = {
      id: "a",
      type: "arrow",
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      cx: 5,
      cy: 0,
      stroke: "#f00",
      strokeWidth: 2,
    };
    const c = cloneAnnotation(src, "b", 10, 10) as ArrowAnnotation;
    expect([c.x1, c.y1, c.x2, c.y2, c.cx, c.cy]).toEqual([10, 10, 20, 20, 15, 10]);
  });

  it("clones an image's crop object but keeps the same src string", () => {
    const src = image("i");
    const c = cloneAnnotation(src, "j", 10, 10) as ImageAnnotation;
    expect(c.src).toBe(src.src);
    expect(c.crop).toEqual(src.crop);
    expect(c.crop).not.toBe(src.crop);
  });
});

describe("store duplicate action", () => {
  beforeEach(() => load([rect("a"), rect("b", 20, 20), rect("c")]));

  it("inserts the copy directly above the original and selects it", () => {
    const id = useEditor.getState().duplicate("b");
    expect(id).toBeTruthy();
    const s = useEditor.getState();
    expect(ids(s.annotations)).toEqual(["a", "b", id, "c"]);
    expect(s.selectedId).toBe(id);
    const copy = s.annotations[2] as RectAnnotation;
    expect([copy.x, copy.y]).toEqual([30, 30]);
  });

  it("honours a custom delta", () => {
    const id = useEditor.getState().duplicate("b", { dx: -10, dy: 10 })!;
    const copy = useEditor.getState().annotations.find((a) => a.id === id) as RectAnnotation;
    expect([copy.x, copy.y]).toEqual([10, 30]);
  });

  it("repeated duplicates chain off the latest copy", () => {
    const first = useEditor.getState().duplicate("b")!;
    const second = useEditor.getState().duplicate(first)!;
    const s = useEditor.getState();
    expect(ids(s.annotations)).toEqual(["a", "b", first, second, "c"]);
    const copy = s.annotations[3] as RectAnnotation;
    expect([copy.x, copy.y]).toEqual([40, 40]);
  });

  it("is one undo entry, and redo restores it", () => {
    const id = useEditor.getState().duplicate("b")!;
    let s = useEditor.getState();
    expect(s.past).toHaveLength(1);
    expect(s.future).toHaveLength(0);
    s.undo();
    s = useEditor.getState();
    expect(ids(s.annotations)).toEqual(["a", "b", "c"]);
    s.redo();
    expect(ids(useEditor.getState().annotations)).toEqual(["a", "b", id, "c"]);
  });

  it("clears the redo stack", () => {
    useEditor.getState().update("a", { x: 1 } as Partial<Annotation>);
    useEditor.getState().undo();
    expect(useEditor.getState().future).toHaveLength(1);
    useEditor.getState().duplicate("b");
    expect(useEditor.getState().future).toHaveLength(0);
  });

  it("returns null and changes nothing for an unknown id", () => {
    const before = useEditor.getState().annotations;
    expect(useEditor.getState().duplicate("zzz")).toBeNull();
    expect(useEditor.getState().annotations).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
  });
});

describe("duplicating a numbered pin", () => {
  it("takes the next pin number and advances it; undo restores the counter", () => {
    load([pin("p1", 1), pin("p2", 2)], 3);
    const id = useEditor.getState().duplicate("p1")!;
    const s = useEditor.getState();
    const copy = s.annotations.find((a) => a.id === id) as PinAnnotation;
    expect(copy.number).toBe(3);
    expect(copy.shape).toBe("bubble");
    expect(s.nextPinNumber).toBe(4);
    s.undo();
    expect(useEditor.getState().nextPinNumber).toBe(3);
  });

  it("does not touch the pin counter for non-pin copies", () => {
    load([rect("a")], 7);
    useEditor.getState().duplicate("a");
    expect(useEditor.getState().nextPinNumber).toBe(7);
  });
});
