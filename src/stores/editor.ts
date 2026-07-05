"use client";

import { create } from "zustand";

export type Tool =
  | "select"
  | "arrow"
  | "rect"
  | "text"
  | "blur"
  | "sticker"
  | "pin"
  | "crop";

/**
 * Source-relative crop rectangle in the loaded image's native pixels.
 * `null` = no crop (full image). When set, the editor treats this rect as the
 * working image: annotation coordinates live in the cropped space (origin at
 * the crop's top-left) and export emits exactly this region.
 */
export type ImageCrop = { x: number; y: number; w: number; h: number };

type Base = { id: string; rotation?: number };

export type RectAnnotation = Base & {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
};

export type ArrowAnnotation = Base & {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

export type TextFontStyle = "normal" | "bold" | "italic" | "italic bold";
export type TextDecoration =
  | ""
  | "underline"
  | "line-through"
  | "underline line-through";

export type TextAnnotation = Base & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
  fontStyle?: TextFontStyle;
  textDecoration?: TextDecoration;
  fontFamily?: string;
  backgroundColor?: string | null;
};

export type BlurAnnotation = Base & {
  type: "blur";
  x: number;
  y: number;
  w: number;
  h: number;
  blurRadius: number;
};

export type StickerAnnotation = Base & {
  type: "sticker";
  x: number;
  y: number;
  fontSize: number;
  kind?: "emoji" | "image";
  char?: string;
  src?: string;
  name?: string;
};

export type StickerSelection =
  | { kind: "emoji"; char: string }
  | { kind: "image"; src: string; name: string };

export type PinShapeKind = "circle" | "bubble" | "mappin";
export type PinTailDir = "down" | "up" | "left" | "right";

export type PinAnnotation = Base & {
  type: "pin";
  x: number;
  y: number;
  number: number;
  color: string;
  size: number;
  labelColor?: string;
  borderColor?: string;
  borderWidth?: number;
  shape?: PinShapeKind;
  bubbleTail?: PinTailDir;
};

export type Annotation =
  | RectAnnotation
  | ArrowAnnotation
  | TextAnnotation
  | BlurAnnotation
  | StickerAnnotation
  | PinAnnotation;

export const STICKERS = [
  "⭐",
  "❤️",
  "✅",
  "❌",
  "👍",
  "👎",
  "🔥",
  "💡",
  "⚠️",
  "🎯",
] as const;

type Snapshot = {
  annotations: Annotation[];
  nextPinNumber: number;
  imageCrop: ImageCrop | null;
};

/** Translate an annotation's positional fields by (dx, dy) in image pixels. */
function shiftAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  if (a.type === "arrow") {
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }
  return { ...a, x: a.x + dx, y: a.y + dy };
}

function cropEq(a: ImageCrop | null, b: ImageCrop | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

type State = {
  tool: Tool;
  annotations: Annotation[];
  selectedId: string | null;
  stickerSelection: StickerSelection;
  nextPinNumber: number;
  past: Snapshot[];
  future: Snapshot[];
  hasImage: boolean;
  /** Current crop into the source image, or null for the full image. */
  imageCrop: ImageCrop | null;
  /** 0 = uninitialised; EditorStage fits on first image load and on `reset`. */
  displayScale: number;
  /** Transient snap guide lines (image-pixel coords). Not in undo history. */
  guides: { x: number[]; y: number[] };

  setTool: (t: Tool) => void;
  setStickerSelection: (sel: StickerSelection) => void;
  setNextPinNumber: (n: number) => void;
  setHasImage: (v: boolean) => void;
  select: (id: string | null) => void;
  add: (a: Annotation) => void;
  update: (id: string, patch: Partial<Annotation>) => void;
  remove: (id: string) => void;
  clear: () => void;
  reset: () => void;
  /**
   * Apply a crop. `sel` is in current *displayed* image coordinates (relative
   * to the active crop); `src` is the source image's native size, used to seed
   * the base rect when there is no crop yet. Composes onto any existing crop,
   * shifts annotations into the new origin, and pushes one undo step.
   */
  applyCrop: (sel: ImageCrop, src: { w: number; h: number }) => void;
  undo: () => void;
  redo: () => void;
  setDisplayScale: (s: number) => void;
  zoomFit: (size: { vw: number; vh: number; iw: number; ih: number }) => void;
  zoomReset100: () => void;
  setGuides: (g: { x: number[]; y: number[] }) => void;
};

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 32;
export const clampZoom = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

const HISTORY_LIMIT = 100;

function pushHistory(past: Snapshot[], snap: Snapshot): Snapshot[] {
  const next = [...past, snap];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

export const useEditor = create<State>((set, get) => ({
  tool: "select",
  annotations: [],
  selectedId: null,
  stickerSelection: { kind: "emoji", char: STICKERS[0] },
  nextPinNumber: 1,
  past: [],
  future: [],
  hasImage: false,
  imageCrop: null,
  displayScale: 0,
  guides: { x: [], y: [] },

  setTool: (t) =>
    set({ tool: t, selectedId: t === "select" ? get().selectedId : null }),
  setStickerSelection: (sel) => set({ stickerSelection: sel }),
  setNextPinNumber: (n) => set({ nextPinNumber: n }),
  setHasImage: (v) => set({ hasImage: v }),
  select: (id) => set({ selectedId: id }),

  add: (a) => {
    const { annotations, nextPinNumber, past, imageCrop } = get();
    const advancePin = a.type === "pin";
    set({
      annotations: [...annotations, a],
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
      selectedId: a.id,
      nextPinNumber: advancePin ? a.number + 1 : nextPinNumber,
    });
  },

  update: (id, patch) => {
    const { annotations, nextPinNumber, past, imageCrop } = get();
    const next = annotations.map((x) =>
      x.id === id ? ({ ...x, ...patch } as Annotation) : x,
    );
    set({
      annotations: next,
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
    });
  },

  remove: (id) => {
    const { annotations, nextPinNumber, past, selectedId, imageCrop } = get();
    set({
      annotations: annotations.filter((x) => x.id !== id),
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
      selectedId: selectedId === id ? null : selectedId,
    });
  },

  clear: () => {
    const { annotations, nextPinNumber, past, imageCrop } = get();
    if (!annotations.length) return;
    set({
      annotations: [],
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
      selectedId: null,
    });
  },

  reset: () =>
    set({
      annotations: [],
      selectedId: null,
      past: [],
      future: [],
      imageCrop: null,
      displayScale: 0,
      guides: { x: [], y: [] },
    }),

  applyCrop: (sel, src) => {
    const { annotations, nextPinNumber, past, imageCrop } = get();
    const base = imageCrop ?? { x: 0, y: 0, w: src.w, h: src.h };
    if (base.w <= 0 || base.h <= 0) return;
    // Clamp the selection to the current displayed image bounds.
    const sx = Math.max(0, Math.min(sel.x, base.w));
    const sy = Math.max(0, Math.min(sel.y, base.h));
    const sw = Math.max(1, Math.min(sel.w, base.w - sx));
    const sh = Math.max(1, Math.min(sel.h, base.h - sy));
    const next: ImageCrop = { x: base.x + sx, y: base.y + sy, w: sw, h: sh };
    const shifted = annotations.map((a) => shiftAnnotation(a, -sx, -sy));
    set({
      annotations: shifted,
      imageCrop: next,
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
      selectedId: null,
      tool: "select",
      // Re-fit + re-center for the new image dimensions (0 = fit sentinel).
      displayScale: 0,
    });
  },

  undo: () => {
    const { past, future, annotations, nextPinNumber, imageCrop } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    const cropChanged = !cropEq(prev.imageCrop, imageCrop);
    set({
      annotations: prev.annotations,
      nextPinNumber: prev.nextPinNumber,
      imageCrop: prev.imageCrop,
      past: past.slice(0, -1),
      future: [{ annotations, nextPinNumber, imageCrop }, ...future],
      selectedId: null,
      ...(cropChanged ? { displayScale: 0 } : {}),
    });
  },

  redo: () => {
    const { past, future, annotations, nextPinNumber, imageCrop } = get();
    if (!future.length) return;
    const next = future[0];
    const cropChanged = !cropEq(next.imageCrop, imageCrop);
    set({
      annotations: next.annotations,
      nextPinNumber: next.nextPinNumber,
      imageCrop: next.imageCrop,
      past: [...past, { annotations, nextPinNumber, imageCrop }],
      future: future.slice(1),
      selectedId: null,
      ...(cropChanged ? { displayScale: 0 } : {}),
    });
  },

  setDisplayScale: (s) => set({ displayScale: clampZoom(s) }),
  zoomFit: ({ vw, vh, iw, ih }) => {
    if (iw <= 0 || ih <= 0 || vw <= 0 || vh <= 0) return;
    set({ displayScale: clampZoom(Math.min(vw / iw, vh / ih)) });
  },
  zoomReset100: () => set({ displayScale: 1 }),
  setGuides: (g) => set({ guides: g }),
}));
