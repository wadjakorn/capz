// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { selection, useEditor, type RectAnnotation } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useOcr } from "@/stores/ocr";

function rect(id: string): RectAnnotation {
  return { id, type: "rect", x: 10, y: 10, w: 10, h: 10, stroke: "#f00", strokeWidth: 2 };
}

function press(key: string, target: EventTarget = window): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

const state = () => {
  const { tool, selectedId } = useEditor.getState();
  return { tool, selectedId };
};

describe("useEditorShortcuts — Esc ladder (CP-0069)", () => {
  beforeEach(() => {
    useSettings.setState({ config: structuredClone(DEFAULT_CONFIG) });
    useEditor.getState().reset();
    useEditor.setState({ tool: "rect", annotations: [rect("a")], ...selection(["a"]) });
    renderHook(() => useEditorShortcuts());
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("deselects and returns to Select in one press on a sticky tool", () => {
    const e = press("Escape");
    expect(state()).toEqual({ tool: "select", selectedId: null });
    expect(e.defaultPrevented).toBe(true);
  });

  it("deselects and returns to Select on a non-sticky tool", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.general.keepToolActive.rect = false;
    useSettings.setState({ config });
    press("Escape");
    expect(state()).toEqual({ tool: "select", selectedId: null });
  });

  it("only deselects on the Select tool", () => {
    useEditor.setState({ tool: "select" });
    press("Escape");
    expect(state()).toEqual({ tool: "select", selectedId: null });
  });

  it("cancels crop back to Select", () => {
    useEditor.setState({ tool: "crop", ...selection([]) });
    press("Escape");
    expect(state().tool).toBe("select");
  });

  it("drops a sticky tool to Select with no selection", () => {
    useEditor.setState(selection([]));
    press("Escape");
    expect(state()).toEqual({ tool: "select", selectedId: null });
  });

  it("does nothing while typing in a field", () => {
    const el = document.createElement("input");
    document.body.appendChild(el);
    el.focus();
    press("Escape", el);
    expect(state()).toEqual({ tool: "rect", selectedId: "a" });
  });

  describe("OCR scope (CP-0099)", () => {
    const SCOPE = { rect: { x: 0, y: 0, w: 50, h: 50 }, lines: [] };
    beforeEach(() => useOcr.setState({ mode: true, scope: SCOPE }));
    afterEach(() => useOcr.getState().reset());

    it("Esc clears an OCR scope first and does nothing else", () => {
      const e = press("Escape");
      expect(useOcr.getState().scope).toBe(null);
      expect(useOcr.getState().mode).toBe(true);
      expect(state()).toEqual({ tool: "rect", selectedId: "a" });
      expect(e.defaultPrevented).toBe(true);
      // The next press walks the rest of the ladder as before.
      press("Escape");
      expect(state()).toEqual({ tool: "select", selectedId: null });
    });

    it("does not clear the scope while typing", () => {
      const el = document.createElement("input");
      document.body.appendChild(el);
      el.focus();
      press("Escape", el);
      expect(useOcr.getState().scope).toBe(SCOPE);
    });
  });
});
