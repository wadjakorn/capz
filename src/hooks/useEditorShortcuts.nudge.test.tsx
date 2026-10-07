// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useEditor, type RectAnnotation } from "@/stores/editor";

function rect(id: string, x: number, y: number): RectAnnotation {
  return { id, type: "rect", x, y, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}

function press(
  key: string,
  opts: KeyboardEventInit = {},
  target: EventTarget = window,
): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(e);
  return e;
}

const pos = () => {
  const a = useEditor.getState().annotations[0] as RectAnnotation;
  return [a.x, a.y];
};

describe("useEditorShortcuts — arrow-key nudge (CP-0056)", () => {
  beforeEach(() => {
    useEditor.getState().reset();
    useEditor.setState({
      tool: "select",
      annotations: [rect("a", 10, 10)],
      selectedId: "a",
    });
    renderHook(() => useEditorShortcuts());
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("moves the selection 1px per arrow and prevents scrolling", () => {
    const e = press("ArrowRight");
    expect(pos()).toEqual([11, 10]);
    expect(e.defaultPrevented).toBe(true);
    press("ArrowDown");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowUp");
    press("ArrowUp");
    expect(pos()).toEqual([9, 9]);
  });

  it("moves 10px with Shift", () => {
    press("ArrowUp", { shiftKey: true });
    expect(pos()).toEqual([10, 0]);
  });

  it("does nothing (and keeps default scrolling) with no selection", () => {
    useEditor.setState({ selectedId: null });
    const e = press("ArrowRight");
    expect(pos()).toEqual([10, 10]);
    expect(e.defaultPrevented).toBe(false);
  });

  it("does nothing in crop mode", () => {
    useEditor.setState({ tool: "crop" });
    press("ArrowRight");
    expect(pos()).toEqual([10, 10]);
  });

  it("does nothing while typing in an input or textarea", () => {
    for (const tag of ["input", "textarea"] as const) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      el.focus();
      press("ArrowRight", {}, el);
    }
    expect(pos()).toEqual([10, 10]);
  });

  it("ignores Ctrl/Cmd/Alt+Arrow", () => {
    press("ArrowRight", { ctrlKey: true });
    press("ArrowRight", { metaKey: true });
    press("ArrowRight", { altKey: true });
    expect(pos()).toEqual([10, 10]);
  });

  it("leaves arrows a focused widget already consumed", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.addEventListener("keydown", (ev) => ev.preventDefault());
    press("ArrowRight", {}, el);
    expect(pos()).toEqual([10, 10]);
  });

  it("collapses a burst of key presses into one undo step", () => {
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight", { shiftKey: true });
    expect(pos()).toEqual([22, 10]);
    expect(useEditor.getState().past).toHaveLength(1);
  });
});
