import { beforeEach, describe, expect, it } from "vitest";
import { useEditor, type RectAnnotation } from "./editor";

const rect: RectAnnotation = {
  id: "r",
  type: "rect",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  stroke: "#000",
  strokeWidth: 1,
};

const GUIDES = { x: [10], y: [20] };
const NONE = { x: [], y: [] };

// Snap guides are gesture chrome (CP-0079): anything that ends or replaces
// the gesture context must take them down with it.
describe("editor store clears snap guides", () => {
  beforeEach(() => {
    useEditor.getState().reset();
    useEditor.getState().setTool("select");
  });

  it("on tool change", () => {
    useEditor.getState().setGuides(GUIDES);
    useEditor.getState().setTool("rect");
    expect(useEditor.getState().guides).toEqual(NONE);
  });

  it("on undo and redo", () => {
    useEditor.getState().add(rect);
    useEditor.getState().setGuides(GUIDES);
    useEditor.getState().undo();
    expect(useEditor.getState().guides).toEqual(NONE);
    useEditor.getState().setGuides(GUIDES);
    useEditor.getState().redo();
    expect(useEditor.getState().guides).toEqual(NONE);
  });
});
