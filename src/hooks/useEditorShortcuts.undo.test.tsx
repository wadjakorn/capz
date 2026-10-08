// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useEditor, type RectAnnotation } from "@/stores/editor";

function rect(id: string): RectAnnotation {
  return { id, type: "rect", x: 0, y: 0, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
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

const count = () => useEditor.getState().annotations.length;

function setPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

describe("useEditorShortcuts — undo/redo keys (CP-0059)", () => {
  beforeEach(() => {
    useEditor.getState().reset();
    useEditor.getState().add(rect("a"));
    useEditor.getState().undo(); // past empty, future = [add a]
    expect(count()).toBe(0);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("Ctrl+Y redoes off macOS", () => {
    setPlatform("Win32");
    renderHook(() => useEditorShortcuts());
    const e = press("y", { ctrlKey: true });
    expect(count()).toBe(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("Ctrl+Z / Ctrl+Shift+Z still undo / redo", () => {
    setPlatform("Win32");
    renderHook(() => useEditorShortcuts());
    press("z", { ctrlKey: true, shiftKey: true });
    expect(count()).toBe(1);
    press("z", { ctrlKey: true });
    expect(count()).toBe(0);
  });

  it("Cmd+Y / Ctrl+Y stay unbound on macOS", () => {
    setPlatform("MacIntel");
    renderHook(() => useEditorShortcuts());
    press("y", { metaKey: true });
    press("y", { ctrlKey: true });
    expect(count()).toBe(0);
  });

  it("ignores Ctrl+Shift+Y and Ctrl+Alt+Y", () => {
    setPlatform("Win32");
    renderHook(() => useEditorShortcuts());
    press("y", { ctrlKey: true, shiftKey: true });
    press("y", { ctrlKey: true, altKey: true });
    expect(count()).toBe(0);
  });

  it("ignores Ctrl+Y while typing in a field", () => {
    setPlatform("Win32");
    renderHook(() => useEditorShortcuts());
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    const e = press("y", { ctrlKey: true }, ta);
    expect(count()).toBe(0);
    expect(e.defaultPrevented).toBe(false);
  });
});
