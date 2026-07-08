/**
 * Pure geometry helpers for the area-capture overlay's template rectangle.
 *
 * All coordinates are logical (CSS) pixels within a single display, origin at
 * the display's top-left. The overlay converts to physical device pixels via
 * devicePixelRatio at capture time — these helpers never touch that.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** The eight resize handles, named by compass direction. */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** What a pointer is grabbing on the template rect. */
export type DragTarget = ResizeHandle | "move";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * A rectangle centered on the display, sized to `fraction` of its dimensions.
 * This is the default template shown when there is no remembered region.
 */
export function centeredDefaultRect(
  dispW: number,
  dispH: number,
  fraction = 0.6,
): Rect {
  const w = Math.round(dispW * fraction);
  const h = Math.round(dispH * fraction);
  return { x: Math.round((dispW - w) / 2), y: Math.round((dispH - h) / 2), w, h };
}

/**
 * Fit a rect inside the display: shrink it if larger than the display, then
 * clamp its position so it stays fully on-screen. Size is preserved when it
 * already fits.
 */
export function clampRect(rect: Rect, dispW: number, dispH: number): Rect {
  const w = Math.min(rect.w, dispW);
  const h = Math.min(rect.h, dispH);
  const x = clamp(rect.x, 0, dispW - w);
  const y = clamp(rect.y, 0, dispH - h);
  return { x, y, w, h };
}

/** Translate a rect by (dx, dy), keeping it fully inside the display. */
export function moveRect(
  rect: Rect,
  dx: number,
  dy: number,
  dispW: number,
  dispH: number,
): Rect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, dispW, dispH);
}

/**
 * Resize `orig` by dragging `handle` by (dx, dy). Only the edges the handle
 * touches move; the rect is kept ≥ `min` in each axis and fully inside the
 * display.
 */
export function resizeFromHandle(
  orig: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  min: number,
  dispW: number,
  dispH: number,
): Rect {
  let left = orig.x;
  let top = orig.y;
  let right = orig.x + orig.w;
  let bottom = orig.y + orig.h;

  if (handle.includes("w")) left = orig.x + dx;
  if (handle.includes("e")) right = orig.x + orig.w + dx;
  if (handle.includes("n")) top = orig.y + dy;
  if (handle.includes("s")) bottom = orig.y + orig.h + dy;

  left = clamp(left, 0, dispW);
  right = clamp(right, 0, dispW);
  top = clamp(top, 0, dispH);
  bottom = clamp(bottom, 0, dispH);

  // Enforce minimum by pushing back whichever edge is being dragged.
  if (right - left < min) {
    if (handle.includes("w")) left = right - min;
    else right = left + min;
  }
  if (bottom - top < min) {
    if (handle.includes("n")) top = bottom - min;
    else bottom = top + min;
  }

  // The min push may have driven an edge off-screen; pull it back in.
  if (left < 0) {
    left = 0;
    right = Math.max(right, min);
  }
  if (right > dispW) {
    right = dispW;
    left = Math.min(left, dispW - min);
  }
  if (top < 0) {
    top = 0;
    bottom = Math.max(bottom, min);
  }
  if (bottom > dispH) {
    bottom = dispH;
    top = Math.min(top, dispH - min);
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Grow/shrink a rect by (dw, dh) keeping its top-left anchored (keyboard
 * Shift+Arrow). Kept ≥ `min` and inside the display.
 */
export function resizeBy(
  rect: Rect,
  dw: number,
  dh: number,
  min: number,
  dispW: number,
  dispH: number,
): Rect {
  const w = clamp(rect.w + dw, min, dispW - rect.x);
  const h = clamp(rect.h + dh, min, dispH - rect.y);
  return { ...rect, w, h };
}

/**
 * Which part of the template rect is under (px, py): a resize handle if within
 * `handleSize` of one of the eight anchors (corners take priority over edges),
 * "move" if inside the body, else null.
 */
export function hitTestHandle(
  rect: Rect,
  px: number,
  py: number,
  handleSize: number,
): DragTarget | null {
  const half = handleSize / 2;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = rect.x + rect.w;
  const b = rect.y + rect.h;
  // Corners first so they win over adjacent edge handles at the extremes.
  const anchors: Array<[DragTarget, number, number]> = [
    ["nw", rect.x, rect.y],
    ["ne", r, rect.y],
    ["se", r, b],
    ["sw", rect.x, b],
    ["n", cx, rect.y],
    ["e", r, cy],
    ["s", cx, b],
    ["w", rect.x, cy],
  ];
  for (const [h, ax, ay] of anchors) {
    if (Math.abs(px - ax) <= half && Math.abs(py - ay) <= half) return h;
  }
  if (px >= rect.x && px <= r && py >= rect.y && py <= b) return "move";
  return null;
}

/** A rectangle in OS virtual-desktop coordinates (same units as MonitorInfo). */
export type Box = { x: number; y: number; w: number; h: number };

/**
 * Map a rect from the union overlay's CSS pixels to OS virtual-desktop
 * coordinates. `union` is the overlay's OS-unit bounds; `vpW`/`vpH` are the
 * overlay window's CSS size (window.innerWidth/Height). The scale is uniform
 * across the single overlay surface, so this holds across displays.
 */
export function cssToOs(rect: Rect, union: Box, vpW: number, vpH: number): Box {
  const kx = vpW > 0 ? union.w / vpW : 1;
  const ky = vpH > 0 ? union.h / vpH : 1;
  return {
    x: union.x + rect.x * kx,
    y: union.y + rect.y * ky,
    w: rect.w * kx,
    h: rect.h * ky,
  };
}

/** Inverse of {@link cssToOs}: OS virtual coordinates → union overlay CSS px. */
export function osToCss(box: Box, union: Box, vpW: number, vpH: number): Rect {
  const kx = vpW > 0 ? union.w / vpW : 1;
  const ky = vpH > 0 ? union.h / vpH : 1;
  return {
    x: (box.x - union.x) / kx,
    y: (box.y - union.y) / ky,
    w: box.w / kx,
    h: box.h / ky,
  };
}

/** CSS cursor name for a given drag target. */
export function cursorForTarget(t: DragTarget | null): string {
  switch (t) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "move":
      return "move";
    default:
      return "crosshair";
  }
}
