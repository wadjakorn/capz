import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditor,
  type Annotation,
  type ArrowAnnotation,
  type MagnifyAnnotation,
  type RectAnnotation,
} from "./editor";

function rect(id: string, x = 0, y = 0): RectAnnotation {
  return { id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}
function arrow(id: string): ArrowAnnotation {
  return { id, type: "arrow", x1: 0, y1: 0, x2: 20, y2: 0, cx: 10, cy: 5, stroke: "#f00", strokeWidth: 2 };
}
function magnify(id: string): MagnifyAnnotation {
  return {
    id,
    type: "magnify",
    sx: 10,
    sy: 10,
    srw: 5,
    srh: 5,
    x: 50,
    y: 10,
    zoom: 2,
    shape: "circle",
    stroke: "#f00",
    strokeWidth: 2,
  };
}

function load(annotations: Annotation[]) {
  useEditor.setState({
    annotations,
    nextPinNumber: 1,
    selectedId: null,
    selectedIds: [],
    past: [],
    future: [],
    imageCrop: null,
    tool: "select",
    nudgeRun: null,
  });
}

const s = () => useEditor.getState();
const byId = (id: string) => s().annotations.find((a) => a.id === id)!;

describe("multi-select: selection state", () => {
  beforeEach(() => load([rect("a"), rect("b", 20), rect("c", 40)]));

  it("select(id) selects exactly one and mirrors selectedId", () => {
    s().select("a");
    expect(s().selectedIds).toEqual(["a"]);
    expect(s().selectedId).toBe("a");
    s().select(null);
    expect(s().selectedIds).toEqual([]);
    expect(s().selectedId).toBeNull();
  });

  it("toggleSelect adds and removes; selectedId is null at 2+", () => {
    s().select("a");
    s().toggleSelect("b");
    expect(s().selectedIds).toEqual(["a", "b"]);
    expect(s().selectedId).toBeNull();
    s().toggleSelect("a");
    expect(s().selectedIds).toEqual(["b"]);
    expect(s().selectedId).toBe("b");
    s().toggleSelect("b");
    expect(s().selectedIds).toEqual([]);
    expect(s().selectedId).toBeNull();
  });

  it("selectMany de-duplicates and drops unknown ids", () => {
    s().selectMany(["c", "a", "c", "zzz"]);
    expect(s().selectedIds).toEqual(["c", "a"]);
    s().selectMany(["b"]);
    expect(s().selectedId).toBe("b");
  });

  it("add() selects only the new annotation", () => {
    s().selectMany(["a", "b"]);
    s().add(rect("d"));
    expect(s().selectedIds).toEqual(["d"]);
  });

  it("setTool to a drawing tool, undo, redo and hydrate clear the selection", () => {
    s().selectMany(["a", "b"]);
    s().setTool("select");
    expect(s().selectedIds).toEqual(["a", "b"]);
    s().setTool("rect");
    expect(s().selectedIds).toEqual([]);

    s().setTool("select");
    s().moveMany(["a"], 1, 1);
    s().selectMany(["a", "b"]);
    s().undo();
    expect(s().selectedIds).toEqual([]);
    s().selectMany(["a", "b"]);
    s().redo();
    expect(s().selectedIds).toEqual([]);

    s().selectMany(["a", "b"]);
    s().hydrate({
      annotations: [],
      nextPinNumber: 1,
      imageCrop: null,
      backdropOn: false,
      captureSource: "other",
      displayScale: 1,
      userZoomed: false,
    });
    expect(s().selectedIds).toEqual([]);
  });

  it("remove(id) drops it from a multi-selection", () => {
    s().selectMany(["a", "b", "c"]);
    s().remove("b");
    expect(s().selectedIds).toEqual(["a", "c"]);
  });
});

describe("multi-select: group edits are one undo step", () => {
  beforeEach(() => load([rect("a"), arrow("b"), magnify("m"), rect("c", 40)]));

  it("removeMany deletes every id, clears them from the selection, one undo restores", () => {
    s().selectMany(["a", "b", "m"]);
    s().removeMany(["a", "b", "m"]);
    expect(s().annotations.map((a) => a.id)).toEqual(["c"]);
    expect(s().selectedIds).toEqual([]);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().annotations.map((a) => a.id)).toEqual(["a", "b", "m", "c"]);
  });

  it("removeMany with no known id is a no-op (no history entry)", () => {
    s().removeMany(["zzz"]);
    expect(s().past).toHaveLength(0);
  });

  it("moveMany shifts every member (arrow curve + magnifier source and lens)", () => {
    s().moveMany(["a", "b", "m"], 5, -3);
    expect(byId("a")).toMatchObject({ x: 5, y: -3 });
    expect(byId("b")).toMatchObject({ x1: 5, y1: -3, x2: 25, y2: -3, cx: 15, cy: 2 });
    expect(byId("m")).toMatchObject({ sx: 15, sy: 7, x: 55, y: 7 });
    expect(byId("c")).toMatchObject({ x: 40, y: 0 });
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(byId("a")).toMatchObject({ x: 0, y: 0 });
    expect(byId("m")).toMatchObject({ sx: 10, x: 50 });
  });

  it("moveMany by zero is a no-op", () => {
    s().moveMany(["a"], 0, 0);
    expect(s().past).toHaveLength(0);
  });

  it("updateMany patches every member in one step", () => {
    load([rect("a"), rect("b", 20), rect("c", 40)]);
    s().updateMany(["a", "b"], { stroke: "#00f" });
    expect((byId("a") as RectAnnotation).stroke).toBe("#00f");
    expect((byId("b") as RectAnnotation).stroke).toBe("#00f");
    expect((byId("c") as RectAnnotation).stroke).toBe("#f00");
    expect(s().past).toHaveLength(1);
    s().undo();
    expect((byId("a") as RectAnnotation).stroke).toBe("#f00");
  });
});

describe("multi-select: nudgeMany coalescing", () => {
  beforeEach(() => load([rect("a"), rect("b", 20), rect("c", 40)]));

  it("a run of nudges on the same set is one undo step", () => {
    s().nudgeMany(["a", "b"], 1, 0, 1000);
    s().nudgeMany(["b", "a"], 1, 0, 1100);
    s().nudgeMany(["a", "b"], 0, 10, 1200);
    expect(byId("a")).toMatchObject({ x: 2, y: 10 });
    expect(byId("b")).toMatchObject({ x: 22, y: 10 });
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(byId("a")).toMatchObject({ x: 0, y: 0 });
    expect(byId("b")).toMatchObject({ x: 20, y: 0 });
  });

  it("a different set starts a new undo step", () => {
    s().nudgeMany(["a", "b"], 1, 0, 1000);
    s().nudgeMany(["a", "c"], 1, 0, 1100);
    expect(s().past).toHaveLength(2);
  });

  it("single nudge and nudgeMany of one id share a run", () => {
    s().nudge("a", 1, 0, 1000);
    s().nudgeMany(["a"], 1, 0, 1100);
    expect(s().past).toHaveLength(1);
  });
});
