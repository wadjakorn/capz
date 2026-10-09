import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEditor, type Annotation, type RectAnnotation } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useWorkspaces } from "@/stores/workspaces";
import {
  clearStageImageSize,
  setAnnotationNodeLookup,
  setStage,
  setStageImageSize,
} from "@/lib/stageBridge";
import {
  PASTE_OFFSET,
  clampIntoBounds,
  clearElementClipboard,
  copySelectedElement,
  desktopPaste,
  fingerprintRgba,
  fingerprintsMatch,
  getElementClipboard,
  pasteDelta,
  pasteElement,
  setElementClipboard,
  shouldPasteElement,
  type Fingerprint,
} from "./elementClipboard";

function rect(id: string, x: number, y: number, w = 10, h = 10): RectAnnotation {
  return { id, type: "rect", x, y, w, h, stroke: "#f00", strokeWidth: 2 };
}

function load(annotations: Annotation[], selectedId: string | null, tool: "select" | "crop" | "pen" = "select") {
  useEditor.setState({
    annotations,
    selectedId,
    tool,
    hasImage: true,
    nextPinNumber: 1,
    past: [],
    future: [],
    imageCrop: null,
  });
}

/** Solid w×h RGBA buffer. */
function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return data;
}

const FP: Fingerprint = fingerprintRgba(solid(16, 16, [255, 0, 0, 255]), 16, 16);

describe("fingerprintRgba / fingerprintsMatch", () => {
  it("records the pixel size and an 8×8 RGBA grid", () => {
    expect(FP.w).toBe(16);
    expect(FP.h).toBe(16);
    expect(FP.cells).toHaveLength(8 * 8 * 4);
    expect(FP.cells.slice(0, 4)).toEqual([255, 0, 0, 255]);
  });

  it("matches the same image after small re-encoding drift", () => {
    const drift = fingerprintRgba(solid(16, 16, [251, 3, 2, 255]), 16, 16);
    expect(fingerprintsMatch(FP, drift)).toBe(true);
  });

  it("rejects a different size or a different picture", () => {
    expect(fingerprintsMatch(FP, fingerprintRgba(solid(16, 17, [255, 0, 0, 255]), 16, 17))).toBe(false);
    expect(fingerprintsMatch(FP, fingerprintRgba(solid(16, 16, [0, 0, 255, 255]), 16, 16))).toBe(false);
  });

  it("ignores the colour of fully transparent pixels (premultiplied)", () => {
    const a = fingerprintRgba(solid(8, 8, [255, 255, 255, 0]), 8, 8);
    const b = fingerprintRgba(solid(8, 8, [0, 0, 0, 0]), 8, 8);
    expect(fingerprintsMatch(a, b)).toBe(true);
  });

  it("tolerates images smaller than the grid", () => {
    const fp = fingerprintRgba(solid(3, 2, [10, 20, 30, 255]), 3, 2);
    expect(fp.cells).toHaveLength(8 * 8 * 4);
    expect(fingerprintsMatch(fp, fingerprintRgba(solid(3, 2, [10, 20, 30, 255]), 3, 2))).toBe(true);
  });
});

describe("clampIntoBounds", () => {
  const bounds = { w: 100, h: 100 };

  it("does not move a box that is already inside", () => {
    expect(clampIntoBounds({ x: 10, y: 10, w: 20, h: 20 }, bounds)).toEqual({ dx: 0, dy: 0 });
  });

  it("shifts the minimum to get back inside", () => {
    expect(clampIntoBounds({ x: 90, y: -5, w: 20, h: 20 }, bounds)).toEqual({ dx: -10, dy: 5 });
  });

  it("top-left aligns a box larger than the canvas", () => {
    expect(clampIntoBounds({ x: 30, y: 40, w: 200, h: 20 }, bounds)).toEqual({ dx: -30, dy: 0 });
  });

  it("does nothing when either side is unknown", () => {
    expect(clampIntoBounds(null, bounds)).toEqual({ dx: 0, dy: 0 });
    expect(clampIntoBounds({ x: 90, y: 0, w: 20, h: 20 }, null)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("pasteDelta", () => {
  const bounds = { w: 100, h: 100 };
  it("offsets +16 (edge-aware) in the same workspace", () => {
    expect(pasteDelta(true, { x: 10, y: 10, w: 10, h: 10 }, bounds)).toEqual({ dx: PASTE_OFFSET, dy: PASTE_OFFSET });
    expect(pasteDelta(true, { x: 80, y: 10, w: 10, h: 10 }, bounds)).toEqual({ dx: -16, dy: 16 });
  });
  it("keeps the position (clamped) in another workspace", () => {
    expect(pasteDelta(false, { x: 10, y: 10, w: 10, h: 10 }, bounds)).toEqual({ dx: 0, dy: 0 });
    expect(pasteDelta(false, { x: 95, y: 10, w: 10, h: 10 }, bounds)).toEqual({ dx: -5, dy: 0 });
  });
});

describe("shouldPasteElement", () => {
  const clip = { annotation: rect("a", 0, 0), workspaceId: "w1", fingerprint: FP };
  const ready = { tool: "select" as const, hasImage: true };

  it("pastes the element while the OS clipboard still holds its image", () => {
    expect(shouldPasteElement(clip, ready, FP)).toBe(true);
  });

  it("pastes the image once something else was copied", () => {
    const other = fingerprintRgba(solid(16, 16, [0, 255, 0, 255]), 16, 16);
    expect(shouldPasteElement(clip, ready, other)).toBe(false);
    expect(shouldPasteElement(clip, ready, null)).toBe(false); // image, unreadable
    expect(shouldPasteElement(clip, ready, "none")).toBe(false);
  });

  it("without a fingerprint, pastes the element only when the OS clipboard has no image", () => {
    const blind = { ...clip, fingerprint: null };
    expect(shouldPasteElement(blind, ready, "none")).toBe(true);
    expect(shouldPasteElement(blind, ready, FP)).toBe(false);
  });

  it("is off with an empty element clipboard, an empty canvas, or in crop mode", () => {
    expect(shouldPasteElement(null, ready, FP)).toBe(false);
    expect(shouldPasteElement(clip, { ...ready, hasImage: false }, FP)).toBe(false);
    expect(shouldPasteElement(clip, { ...ready, tool: "crop" }, FP)).toBe(false);
  });
});

describe("copySelectedElement", () => {
  beforeEach(() => {
    clearElementClipboard();
    useWorkspaces.setState({ activeId: "w1" });
  });
  afterEach(() => {
    setAnnotationNodeLookup(null);
    setStage(null);
  });

  it("returns false and copies nothing without a selection or in crop mode", async () => {
    load([rect("a", 10, 10)], null);
    expect(await copySelectedElement()).toBe(false);
    load([rect("a", 10, 10)], "a", "crop");
    expect(await copySelectedElement()).toBe(false);
    expect(getElementClipboard()).toBeNull();
  });

  it("clones the selection with its workspace; no fingerprint when the node can't render", async () => {
    load([rect("a", 10, 10)], "a");
    expect(await copySelectedElement()).toBe(true);
    const clip = getElementClipboard()!;
    expect(clip.annotation).toEqual(rect("a", 10, 10));
    expect(clip.annotation).not.toBe(useEditor.getState().annotations[0]);
    expect(clip.workspaceId).toBe("w1");
    expect(clip.fingerprint).toBeNull();
  });

  it("writes the rendered element and remembers its fingerprint", async () => {
    const pixels = solid(4, 4, [0, 0, 255, 255]);
    const canvas = {
      width: 4,
      height: 4,
      toDataURL: () => "data:image/png;base64,AAAA",
      getContext: () => ({ getImageData: () => ({ data: pixels, width: 4, height: 4 }) }),
    };
    const toCanvas = vi.fn(() => canvas);
    setStage({ scaleX: () => 2 } as never);
    setAnnotationNodeLookup(() => ({ toCanvas }) as never);
    const write = vi.fn(async () => true);
    load([rect("a", 10, 10)], "a");
    expect(await copySelectedElement({ write })).toBe(true);
    expect(toCanvas).toHaveBeenCalledWith({ pixelRatio: 0.5 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(getElementClipboard()!.fingerprint).toEqual(fingerprintRgba(pixels, 4, 4));
  });

  it("keeps the element without a fingerprint when the clipboard write fails", async () => {
    const canvas = {
      width: 1,
      height: 1,
      toDataURL: () => "data:image/png;base64,AAAA",
      getContext: () => ({ getImageData: () => ({ data: solid(1, 1, [1, 2, 3, 255]), width: 1, height: 1 }) }),
    };
    setStage({ scaleX: () => 1 } as never);
    setAnnotationNodeLookup(() => ({ toCanvas: () => canvas }) as never);
    load([rect("a", 10, 10)], "a");
    expect(await copySelectedElement({ write: async () => false })).toBe(true);
    expect(getElementClipboard()!.fingerprint).toBeNull();
  });
});

describe("pasteElement", () => {
  beforeEach(() => {
    clearElementClipboard();
    setStageImageSize(100, 100);
    useWorkspaces.setState({ activeId: "w1" });
  });
  afterEach(() => {
    clearStageImageSize();
    vi.restoreAllMocks();
  });

  it("returns null with nothing copied", () => {
    load([], null);
    expect(pasteElement()).toBeNull();
  });

  it("same workspace: +16, on top, selected, Select tool, one undo entry, cascades", () => {
    load([rect("a", 10, 10)], null, "pen");
    setElementClipboard({ annotation: rect("a", 10, 10), workspaceId: "w1", fingerprint: null });
    const id = pasteElement()!;
    let s = useEditor.getState();
    expect(s.annotations).toHaveLength(2);
    expect(s.annotations[1].id).toBe(id);
    expect(id).not.toBe("a");
    expect([(s.annotations[1] as RectAnnotation).x, (s.annotations[1] as RectAnnotation).y]).toEqual([26, 26]);
    expect(s.selectedId).toBe(id);
    expect(s.tool).toBe("select");
    expect(s.past).toHaveLength(1);

    pasteElement();
    s = useEditor.getState();
    expect((s.annotations[2] as RectAnnotation).x).toBe(42);
  });

  it("other workspace: same position, clamped, then cascades there", () => {
    load([], null);
    useWorkspaces.setState({ activeId: "w2" });
    setElementClipboard({ annotation: rect("a", 95, 20, 10, 10), workspaceId: "w1", fingerprint: null });
    pasteElement();
    let a = useEditor.getState().annotations[0] as RectAnnotation;
    expect([a.x, a.y]).toEqual([90, 20]);
    expect(getElementClipboard()!.workspaceId).toBe("w2");

    pasteElement();
    a = useEditor.getState().annotations[1] as RectAnnotation;
    expect([a.x, a.y]).toEqual([74, 36]);
  });

  it("numbers a pasted pin as the next pin and persists the counter", () => {
    const spy = vi.spyOn(useSettings.getState(), "update").mockResolvedValue(undefined);
    load([], null);
    useEditor.setState({ nextPinNumber: 4 });
    setElementClipboard({
      annotation: { id: "p", type: "pin", x: 20, y: 20, number: 1, color: "#f00", size: 24 },
      workspaceId: "w1",
      fingerprint: null,
    });
    pasteElement();
    const s = useEditor.getState();
    expect(s.annotations[0]).toMatchObject({ type: "pin", number: 4 });
    expect(s.nextPinNumber).toBe(5);
    expect(spy).toHaveBeenCalledWith("pins", { lastUsedNumber: 4 });
  });
});

describe("desktopPaste", () => {
  const otherFp = fingerprintRgba(solid(16, 16, [0, 255, 0, 255]), 16, 16);
  function deps(over: Partial<Parameters<typeof desktopPaste>[0]> = {}) {
    return {
      invoke: vi.fn(async (cmd: string) => {
        if (cmd === "read_clipboard_image_data_url") return "data:image/png;base64,AAAA";
        return "";
      }),
      fingerprint: vi.fn(async () => FP),
      addOverlay: vi.fn(async () => "img1"),
      ...over,
    };
  }

  beforeEach(() => {
    clearElementClipboard();
    setStageImageSize(100, 100);
    useWorkspaces.setState({ activeId: "w1" });
    load([rect("a", 10, 10)], null);
  });
  afterEach(() => clearStageImageSize());

  it("empty canvas: the clipboard image becomes the base, as before", async () => {
    useEditor.setState({ hasImage: false });
    const d = deps();
    expect(await desktopPaste(d)).toBe("base");
    expect(d.invoke).toHaveBeenCalledWith("paste_into_editor");
  });

  it("pastes the element when the OS clipboard still matches", async () => {
    setElementClipboard({ annotation: rect("a", 10, 10), workspaceId: "w1", fingerprint: FP });
    const d = deps();
    expect(await desktopPaste(d)).toBe("element");
    expect(d.addOverlay).not.toHaveBeenCalled();
    expect(useEditor.getState().annotations).toHaveLength(2);
  });

  it("pastes the image when the OS clipboard holds something else", async () => {
    setElementClipboard({ annotation: rect("a", 10, 10), workspaceId: "w1", fingerprint: FP });
    const d = deps({ fingerprint: vi.fn(async () => otherFp) });
    expect(await desktopPaste(d)).toBe("image");
    expect(d.addOverlay).toHaveBeenCalledWith("data:image/png;base64,AAAA");
  });

  it("doesn't fingerprint when nothing was element-copied", async () => {
    const d = deps();
    expect(await desktopPaste(d)).toBe("image");
    expect(d.fingerprint).not.toHaveBeenCalled();
  });

  it("reports a failed overlay add, and throws with no image and no element", async () => {
    expect(await desktopPaste(deps({ addOverlay: vi.fn(async () => null) }))).toBe("failed");
    const noImage = deps({
      invoke: vi.fn(async () => {
        throw new Error("clipboard has no image");
      }),
    });
    await expect(desktopPaste(noImage)).rejects.toThrow();
  });

  it("pastes a fingerprint-less element when the OS clipboard has no image", async () => {
    setElementClipboard({ annotation: rect("a", 10, 10), workspaceId: "w1", fingerprint: null });
    const d = deps({
      invoke: vi.fn(async () => {
        throw new Error("clipboard has no image");
      }),
    });
    expect(await desktopPaste(d)).toBe("element");
  });
});
