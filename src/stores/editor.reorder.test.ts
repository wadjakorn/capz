import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditor,
  reorderAnnotations,
  type Annotation,
  type RectAnnotation,
  type ImageAnnotation,
} from "./editor";

function rect(id: string): RectAnnotation {
  return { id, type: "rect", x: 0, y: 0, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}
function image(id: string): ImageAnnotation {
  return { id, type: "image", x: 0, y: 0, w: 20, h: 20, src: "data:," };
}
const ids = (list: Annotation[]) => list.map((a) => a.id);

describe("reorderAnnotations (pure)", () => {
  const base = () => [rect("a"), rect("b"), image("c"), rect("d")];

  it("brings an element to the front (end of array)", () => {
    expect(ids(reorderAnnotations(base(), "b", "front")!)).toEqual(["a", "c", "d", "b"]);
  });
  it("sends an element to the back (index 0, just above the base image)", () => {
    expect(ids(reorderAnnotations(base(), "c", "back")!)).toEqual(["c", "a", "b", "d"]);
  });
  it("steps one forward / backward", () => {
    expect(ids(reorderAnnotations(base(), "b", "forward")!)).toEqual(["a", "c", "b", "d"]);
    expect(ids(reorderAnnotations(base(), "c", "backward")!)).toEqual(["a", "c", "b", "d"]);
  });
  it("returns null for no-op moves (already at edge, or unknown id)", () => {
    expect(reorderAnnotations(base(), "d", "front")).toBeNull();
    expect(reorderAnnotations(base(), "a", "back")).toBeNull();
    expect(reorderAnnotations(base(), "d", "forward")).toBeNull();
    expect(reorderAnnotations(base(), "a", "backward")).toBeNull();
    expect(reorderAnnotations(base(), "zzz", "front")).toBeNull();
  });
});

describe("store reorder action", () => {
  beforeEach(() => useEditor.getState().reset());

  it("reorders and is covered by undo/redo", () => {
    const s = useEditor.getState();
    s.add(rect("a"));
    s.add(rect("b"));
    s.add(image("c"));
    expect(ids(useEditor.getState().annotations)).toEqual(["a", "b", "c"]);

    useEditor.getState().reorder("c", "back");
    expect(ids(useEditor.getState().annotations)).toEqual(["c", "a", "b"]);

    useEditor.getState().undo();
    expect(ids(useEditor.getState().annotations)).toEqual(["a", "b", "c"]);

    useEditor.getState().redo();
    expect(ids(useEditor.getState().annotations)).toEqual(["c", "a", "b"]);
  });

  it("no-op reorder does not push history", () => {
    const s = useEditor.getState();
    s.add(rect("a"));
    s.add(rect("b"));
    const before = useEditor.getState().past.length;
    useEditor.getState().reorder("b", "front"); // already frontmost
    expect(useEditor.getState().past.length).toBe(before);
  });
});
