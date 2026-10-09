import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEditor, type Annotation, type RectAnnotation } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { clearStageImageSize, setStageImageSize } from "@/lib/stageBridge";
import {
  DUPLICATE_OFFSET,
  canDuplicate,
  duplicateOffset,
  duplicateSelected,
} from "./duplicate";

function rect(id: string, x: number, y: number, w = 10, h = 10): RectAnnotation {
  return { id, type: "rect", x, y, w, h, stroke: "#f00", strokeWidth: 2 };
}

function load(annotations: Annotation[], selectedId: string | null, tool: "select" | "crop" = "select") {
  useEditor.setState({
    annotations,
    selectedId,
    tool,
    nextPinNumber: 1,
    past: [],
    future: [],
    imageCrop: null,
  });
}

describe("duplicateOffset", () => {
  const bounds = { w: 100, h: 100 };

  it("is +10,+10 away from the edges", () => {
    expect(duplicateOffset({ x: 10, y: 10, w: 20, h: 20 }, bounds)).toEqual({ dx: 10, dy: 10 });
  });

  it("flips an axis to -10 when the copy would run past the right/bottom edge", () => {
    expect(duplicateOffset({ x: 75, y: 10, w: 20, h: 20 }, bounds)).toEqual({ dx: -10, dy: 10 });
    expect(duplicateOffset({ x: 10, y: 75, w: 20, h: 20 }, bounds)).toEqual({ dx: 10, dy: -10 });
  });

  it("keeps +10 when flipping would cross the left/top edge too", () => {
    expect(duplicateOffset({ x: 5, y: 5, w: 95, h: 95 }, bounds)).toEqual({ dx: 10, dy: 10 });
  });

  it("takes a custom distance", () => {
    expect(duplicateOffset({ x: 10, y: 75, w: 20, h: 20 }, bounds, 16)).toEqual({ dx: 16, dy: -16 });
  });

  it("is +10,+10 when the bounds or the box are unknown", () => {
    expect(duplicateOffset(null, bounds)).toEqual({ dx: DUPLICATE_OFFSET, dy: DUPLICATE_OFFSET });
    expect(duplicateOffset({ x: 95, y: 95, w: 20, h: 20 }, null)).toEqual({ dx: 10, dy: 10 });
  });
});

describe("canDuplicate", () => {
  it("needs a selection and a non-crop tool", () => {
    expect(canDuplicate({ tool: "select", selectedId: "a" })).toBe(true);
    expect(canDuplicate({ tool: "arrow", selectedId: "a" })).toBe(true);
    expect(canDuplicate({ tool: "select", selectedId: null })).toBe(false);
    expect(canDuplicate({ tool: "crop", selectedId: "a" })).toBe(false);
  });
});

describe("duplicateSelected", () => {
  afterEach(() => {
    clearStageImageSize();
    vi.restoreAllMocks();
  });

  beforeEach(() => setStageImageSize(100, 100));

  it("no-ops with nothing selected", () => {
    load([rect("a", 10, 10)], null);
    expect(duplicateSelected()).toBeNull();
    expect(useEditor.getState().annotations).toHaveLength(1);
  });

  it("no-ops in crop mode", () => {
    load([rect("a", 10, 10)], "a", "crop");
    expect(duplicateSelected()).toBeNull();
    expect(useEditor.getState().annotations).toHaveLength(1);
  });

  it("duplicates the selection with an edge-aware offset", () => {
    load([rect("a", 85, 10)], "a");
    const id = duplicateSelected();
    const s = useEditor.getState();
    expect(s.selectedId).toBe(id);
    const copy = s.annotations[1] as RectAnnotation;
    expect([copy.x, copy.y]).toEqual([75, 20]);
  });

  it("persists the pin counter for a pin copy", () => {
    const spy = vi.spyOn(useSettings.getState(), "update").mockResolvedValue(undefined);
    useEditor.setState({
      annotations: [{ id: "p", type: "pin", x: 20, y: 20, number: 1, color: "#f00", size: 24 }],
      selectedId: "p",
      tool: "select",
      nextPinNumber: 2,
      past: [],
      future: [],
    });
    duplicateSelected();
    expect(spy).toHaveBeenCalledWith("pins", { lastUsedNumber: 2 });
  });

  it("does not touch pin settings for other types", () => {
    const spy = vi.spyOn(useSettings.getState(), "update").mockResolvedValue(undefined);
    load([rect("a", 10, 10)], "a");
    duplicateSelected();
    expect(spy).not.toHaveBeenCalled();
  });
});
