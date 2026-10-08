// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useEditor, type RectAnnotation } from "@/stores/editor";

// CP-0061: with the Thai (Kedmanee) layout active, e.key is a Thai character;
// shortcuts must still match on the physical key.

function rect(id: string): RectAnnotation {
  return { id, type: "rect", x: 0, y: 0, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}

function press(key: string, code: string, opts: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(e);
  return e;
}

const count = () => useEditor.getState().annotations.length;

describe("useEditorShortcuts — Thai keyboard layout (CP-0061)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    useEditor.getState().reset();
    useEditor.getState().add(rect("a"));
    expect(count()).toBe(1);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Ctrl+Z (ผ) undoes and Ctrl+Y (ั) redoes", () => {
    renderHook(() => useEditorShortcuts());
    const z = press("ผ", "KeyZ", { ctrlKey: true });
    expect(z.defaultPrevented).toBe(true);
    expect(count()).toBe(0);
    press("ั", "KeyY", { ctrlKey: true });
    expect(count()).toBe(1);
  });

  it("Ctrl+Shift+Z (Thai Shift+Z types '(') redoes", () => {
    renderHook(() => useEditorShortcuts());
    press("ผ", "KeyZ", { ctrlKey: true });
    expect(count()).toBe(0);
    press("(", "KeyZ", { ctrlKey: true, shiftKey: true });
    expect(count()).toBe(1);
  });

  it("Ctrl+D (ก) duplicates the selection", () => {
    renderHook(() => useEditorShortcuts());
    useEditor.getState().select("a");
    const e = press("ก", "KeyD", { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(count()).toBe(2);
  });

  it("bare tool key (พ = R) picks the tool", () => {
    renderHook(() => useEditorShortcuts());
    useEditor.getState().setTool("select");
    press("พ", "KeyR");
    expect(useEditor.getState().tool).toBe("rect");
  });
});
