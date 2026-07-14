"use client";

import { create } from "zustand";

export type Tool =
  | "select"
  | "arrow"
  | "rect"
  | "text"
  | "blur"
  | "pen"
  | "highlighter"
  | "magnify"
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

/** Which capture opened the current editor image (mirrors Rust CaptureSource). */
export type CaptureSource = "full" | "area" | "window" | "scroll" | "other";

type Base = { id: string; rotation?: number };

/** Shape variants offered by the (formerly "rect") Shapes tool. "line"/"dashline"
 *  draw a headless 2-point segment (stored as an arrow with heads:"none"),
 *  solid or dashed respectively — not a box. */
export type RectShapeKind = "rect" | "ellipse" | "line" | "dashline";

export type RectAnnotation = Base & {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
  /** Which primitive to draw inside the bounding box. Absent = "rect". */
  shape?: RectShapeKind;
  /** Corner radius for the rect variant, in image px. Absent = 0. Ignored for ellipse. */
  cornerRadius?: number;
};

/** Arrowhead placement. "none" is the headless line variant of the Shapes tool. */
export type ArrowHeads = "end" | "both" | "none";

export type ArrowAnnotation = Base & {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  /**
   * Optional mid curve-control point (Shottr-style 3-point arrow). When absent
   * the arrow is a straight segment; when set, the arrow bends smoothly through
   * (cx, cy). A cx/cy equal to the chord midpoint renders as a straight arrow.
   */
  cx?: number;
  cy?: number;
  /** Which ends get an arrowhead. Absent = "end" (single head at the tip). */
  heads?: ArrowHeads;
  /** Dashed/dotted stroke when true. */
  dash?: boolean;
};

/** How a freehand (pen) path is smoothed for rendering. */
export type FreehandMode = "raw" | "polygon" | "curve";

export type FreehandAnnotation = Base & {
  type: "pen";
  /** Flat [x0,y0,x1,y1,…] captured path in image-pixel coords. */
  points: number[];
  stroke: string;
  strokeWidth: number;
  mode: FreehandMode;
  /** "polygon" straightening strength — RDP epsilon in px. Absent = default. */
  polygonEpsilon?: number;
  /** "curve" smoothing strength — RDP epsilon (px) before a fixed spline
   *  tension; higher = rounder/smoother curve. Absent = default. */
  curveSmoothing?: number;
};

export type HighlighterAnnotation = Base & {
  type: "highlighter";
  /** Flat [x0,y0,x1,y1,…] captured path in image-pixel coords. */
  points: number[];
  stroke: string;
  strokeWidth: number;
  /** Marker opacity 0..1. Absent = default. */
  opacity?: number;
};

export type MagnifyShape = "circle" | "rect";

export type MagnifyAnnotation = Base & {
  type: "magnify";
  /** Source (magnify) area center — the region being zoomed (image coords). */
  sx: number;
  sy: number;
  /** Source area half-width / half-height (image px). Non-uniform → rect / oval. */
  srw: number;
  srh: number;
  /** Output center — where the magnified loupe is drawn (image coords). */
  x: number;
  y: number;
  /** Magnification factor; output half-extents = (srw, srh) × zoom. */
  zoom: number;
  shape: MagnifyShape;
  /** Border + connector color. */
  stroke: string;
  /** Output loupe border width. */
  strokeWidth: number;
  /** Source (zoom) area border width; the connector follows it too.
   *  Absent = legacy default (0.6 × strokeWidth). */
  sourceStrokeWidth?: number;
  /** Whether the source border tracks the output border (0.6× ratio) as one
   *  "Border" control. Absent = linked. Set false for independent widths. */
  borderLinked?: boolean;
  /** Source-area indicator opacity 0..1 (0 hides it for a clean capture).
   *  Absent = default (visible). */
  areaOpacity?: number;
  /** Connector "link" line dashed when true, solid when false. Absent = dashed. */
  linkDash?: boolean;
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
  /** Horizontal background padding in image px (vertical is derived). Absent = default. */
  bgPadding?: number;
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

/**
 * An additional image layered onto the canvas (via "Add image" mode / import),
 * distinct from the single base screenshot. Unlike an image sticker it has
 * independent `w`/`h`, so the shared Transformer resizes it with a free box.
 */
export type ImageAnnotation = Base & {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  /** Per-object crop in the image's own natural pixels. Absent = full image. */
  crop?: { x: number; y: number; w: number; h: number };
};

export type Annotation =
  | RectAnnotation
  | ArrowAnnotation
  | TextAnnotation
  | BlurAnnotation
  | FreehandAnnotation
  | HighlighterAnnotation
  | MagnifyAnnotation
  | StickerAnnotation
  | PinAnnotation
  | ImageAnnotation;

/** Stacking-order operation for a single annotation within the render array. */
export type ReorderMode = "front" | "back" | "forward" | "backward";

/**
 * Return a new annotations array with `id` moved per `mode`, or null when the
 * move is a no-op (id absent, or already at the target edge). Array position IS
 * z-order — later index draws on top; index 0 is just above the base image.
 */
export function reorderAnnotations(
  list: Annotation[],
  id: string,
  mode: ReorderMode,
): Annotation[] | null {
  const from = list.findIndex((a) => a.id === id);
  if (from < 0) return null;
  const last = list.length - 1;
  const to =
    mode === "front"
      ? last
      : mode === "back"
        ? 0
        : mode === "forward"
          ? Math.min(last, from + 1)
          : Math.max(0, from - 1);
  if (to === from) return null;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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
    const next: ArrowAnnotation = {
      ...a,
      x1: a.x1 + dx,
      y1: a.y1 + dy,
      x2: a.x2 + dx,
      y2: a.y2 + dy,
    };
    if (a.cx !== undefined && a.cy !== undefined) {
      next.cx = a.cx + dx;
      next.cy = a.cy + dy;
    }
    return next;
  }
  if (a.type === "pen" || a.type === "highlighter") {
    const pts = a.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
    return { ...a, points: pts };
  }
  if (a.type === "magnify") {
    return { ...a, sx: a.sx + dx, sy: a.sy + dy, x: a.x + dx, y: a.y + dy };
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
  /** Which capture produced the current image (drives backdrop default). */
  captureSource: CaptureSource;
  /** Whether the padded backdrop is rendered behind the capture. */
  backdropOn: boolean;
  /**
   * "Add image" mode. When true, pasting / dropping / picking an image ADDS it
   * as a layered `ImageAnnotation` on top instead of replacing the workspace.
   */
  addImageMode: boolean;
  /** Current crop into the source image, or null for the full image. */
  imageCrop: ImageCrop | null;
  /** 0 = uninitialised; EditorStage fits on first image load and on `reset`. */
  displayScale: number;
  /**
   * True once the user sets a custom zoom (wheel, +/-, 100%). Cleared by any
   * auto/explicit fit. EditorStage only re-fits on window resize while this is
   * false, so a deliberate zoom survives resizing.
   */
  userZoomed: boolean;
  /** Transient snap guide lines (image-pixel coords). Not in undo history. */
  guides: { x: number[]; y: number[] };

  setTool: (t: Tool) => void;
  setStickerSelection: (sel: StickerSelection) => void;
  setNextPinNumber: (n: number) => void;
  setHasImage: (v: boolean) => void;
  setCaptureSource: (s: CaptureSource) => void;
  setBackdropOn: (on: boolean) => void;
  setAddImageMode: (on: boolean) => void;
  select: (id: string | null) => void;
  add: (a: Annotation) => void;
  update: (id: string, patch: Partial<Annotation>) => void;
  remove: (id: string) => void;
  /** Change a single annotation's stacking order; history-tracked. */
  reorder: (id: string, mode: ReorderMode) => void;
  clear: () => void;
  reset: () => void;
  /**
   * Apply a crop. `sel` is in current *displayed* image coordinates (relative
   * to the active crop); `src` is the source image's native size, used to seed
   * the base rect when there is no crop yet. Composes onto any existing crop,
   * shifts annotations into the new origin, and pushes one undo step.
   */
  applyCrop: (sel: ImageCrop, src: { w: number; h: number }) => void;
  /**
   * Crop a single layered `ImageAnnotation` (not the base screenshot). `sel` is
   * in the image's *displayed box* coordinates (origin at the box's top-left,
   * 0..w × 0..h); `natural` is the source bitmap's native size, used to seed the
   * base rect when the image has no crop yet. Maps the selection into source
   * natural pixels, composes onto any existing `crop`, trims the box to the
   * cropped region, and pushes one undo step. No-op for a non-image id.
   */
  applyImageCrop: (
    id: string,
    sel: ImageCrop,
    natural: { w: number; h: number },
  ) => void;
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
  captureSource: "other",
  backdropOn: false,
  addImageMode: false,
  imageCrop: null,
  displayScale: 0,
  userZoomed: false,
  guides: { x: [], y: [] },

  setTool: (t) =>
    // Crop keeps the current selection so per-object image crop knows its
    // target; every other tool clears it (as before).
    set({
      tool: t,
      selectedId: t === "select" || t === "crop" ? get().selectedId : null,
    }),
  setStickerSelection: (sel) => set({ stickerSelection: sel }),
  setNextPinNumber: (n) => set({ nextPinNumber: n }),
  setHasImage: (v) => set({ hasImage: v }),
  setCaptureSource: (s) => set({ captureSource: s }),
  setBackdropOn: (on) => set({ backdropOn: on }),
  setAddImageMode: (on) => set({ addImageMode: on }),
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

  reorder: (id, mode) => {
    const { annotations, nextPinNumber, past, imageCrop } = get();
    const next = reorderAnnotations(annotations, id, mode);
    if (!next) return;
    set({
      annotations: next,
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
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
      userZoomed: false,
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
      userZoomed: false,
    });
  },

  applyImageCrop: (id, sel, natural) => {
    const { annotations, nextPinNumber, past, imageCrop } = get();
    const a = annotations.find((x) => x.id === id);
    if (!a || a.type !== "image" || a.w <= 0 || a.h <= 0) return;
    // Current visible source region (natural px). Absent crop = whole bitmap.
    const base = a.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
    if (base.w <= 0 || base.h <= 0) return;
    // Clamp the selection to the displayed box.
    const lx = Math.max(0, Math.min(sel.x, a.w));
    const ly = Math.max(0, Math.min(sel.y, a.h));
    const lw = Math.max(1, Math.min(sel.w, a.w - lx));
    const lh = Math.max(1, Math.min(sel.h, a.h - ly));
    // Display px → source natural px (compose onto the existing crop).
    const scaleX = base.w / a.w;
    const scaleY = base.h / a.h;
    const nextCrop = {
      x: Math.round(base.x + lx * scaleX),
      y: Math.round(base.y + ly * scaleY),
      w: Math.max(1, Math.round(lw * scaleX)),
      h: Math.max(1, Math.round(lh * scaleY)),
    };
    // Trim the box to the kept region; display scale/position stay put.
    const patched: ImageAnnotation = {
      ...a,
      x: Math.round(a.x + lx),
      y: Math.round(a.y + ly),
      w: Math.round(lw),
      h: Math.round(lh),
      crop: nextCrop,
    };
    set({
      annotations: annotations.map((x) => (x.id === id ? patched : x)),
      past: pushHistory(past, { annotations, nextPinNumber, imageCrop }),
      future: [],
      selectedId: id,
      tool: "select",
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
      ...(cropChanged ? { displayScale: 0, userZoomed: false } : {}),
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
      ...(cropChanged ? { displayScale: 0, userZoomed: false } : {}),
    });
  },

  // s <= 0 is the fit sentinel (re-fit on next paint): keep it exactly 0 and
  // treat it as "not user-zoomed". Any positive scale is a deliberate user zoom.
  setDisplayScale: (s) =>
    set(
      s <= 0
        ? { displayScale: 0, userZoomed: false }
        : { displayScale: clampZoom(s), userZoomed: true },
    ),
  zoomFit: ({ vw, vh, iw, ih }) => {
    if (iw <= 0 || ih <= 0 || vw <= 0 || vh <= 0) return;
    set({ displayScale: clampZoom(Math.min(vw / iw, vh / ih)), userZoomed: false });
  },
  zoomReset100: () => set({ displayScale: 1, userZoomed: true }),
  setGuides: (g) => set({ guides: g }),
}));
