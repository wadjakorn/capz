// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { selection, useEditor, type RectAnnotation } from "@/stores/editor";

function rect(id: string, x: number, y: number): RectAnnotation {
  return { id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}

function press(key: string, opts: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(e);
  return e;
}

const s = () => useEditor.getState();
const xs = () => s().annotations.map((a) => (a as RectAnnotation).x);

describe("useEditorShortcuts — multi-selection (CP-0050)", () => {
  beforeEach(() => {
    s().reset();
    useEditor.setState({
      tool: "select",
      annotations: [rect("a", 0, 0), rect("b", 20, 0), rect("c", 40, 0)],
      ...selection(["a", "b"]),
      nudgeRun: null,
    });
    renderHook(() => useEditorShortcuts());
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("Delete removes every selected annotation in one undo step", () => {
    const e = press("Delete");
    expect(e.defaultPrevented).toBe(true);
    expect(s().annotations.map((a) => a.id)).toEqual(["c"]);
    s().undo();
    expect(s().annotations.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("Backspace does the same", () => {
    press("Backspace");
    expect(s().annotations.map((a) => a.id)).toEqual(["c"]);
  });

  it("arrow keys nudge the whole group; a run is one undo step", () => {
    press("ArrowRight");
    press("ArrowRight", { shiftKey: true });
    expect(xs()).toEqual([11, 31, 40]);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(xs()).toEqual([0, 20, 40]);
  });

  it("Esc clears a multi-selection", () => {
    press("Escape");
    expect(s().selectedIds).toEqual([]);
  });

  it("Cmd/Ctrl+D does nothing with 2+ selected", () => {
    press("d", { ctrlKey: true });
    expect(s().annotations).toHaveLength(3);
  });
});
