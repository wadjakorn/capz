import type { AABB } from "@/lib/annotationBounds";

/**
 * Highlighter blend mode (CP-0066). `multiply` keeps dark text crisp on light
 * backgrounds but can only darken, so on dark surfaces the stroke vanishes;
 * there `screen` tints the background with the highlight colour instead. The
 * mode is picked per stroke from the base image's mean luminance under it.
 */
export type HighlightBlend = "multiply" | "screen";

/** Mean luminance below this → `screen`. */
const THRESHOLD = 0.5;
/** Long side of the cached luminance grid, in cells. */
const GRID_MAX = 256;

/** Downscaled per-cell luminance (0..1) of a source image. */
export type LumaGrid = {
  cols: number;
  rows: number;
  /** Source-image pixels per cell. */
  cellW: number;
  cellH: number;
  luma: Float32Array;
};

/** Build a grid from an RGBA buffer of `cols`×`rows` cells covering a
 *  `srcW`×`srcH` image. Transparent pixels count as white. */
export function lumaGridFromRGBA(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  srcW: number,
  srcH: number,
): LumaGrid {
  const luma = new Float32Array(cols * rows);
  for (let i = 0; i < luma.length; i++) {
    const o = i * 4;
    const a = data[o + 3] / 255;
    const l = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    luma[i] = l * a + (1 - a);
  }
  return { cols, rows, cellW: srcW / cols, cellH: srcH / rows, luma };
}

/** Area-weighted mean luminance of the grid under `box` (source-image px);
 *  `multiply` when there is nothing to sample. */
export function pickHighlightBlend(
  grid: LumaGrid | null,
  box: AABB | null,
): HighlightBlend {
  if (!grid || !box) return "multiply";
  const { cols, rows, cellW, cellH, luma } = grid;
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const x1 = Math.min(cols * cellW, box.x + box.w);
  const y1 = Math.min(rows * cellH, box.y + box.h);
  if (x1 <= x0 || y1 <= y0) return "multiply";
  const c0 = Math.floor(x0 / cellW);
  const c1 = Math.min(cols - 1, Math.floor((x1 - 1e-9) / cellW));
  const r0 = Math.floor(y0 / cellH);
  const r1 = Math.min(rows - 1, Math.floor((y1 - 1e-9) / cellH));
  let sum = 0;
  let area = 0;
  for (let r = r0; r <= r1; r++) {
    const h = Math.min(y1, (r + 1) * cellH) - Math.max(y0, r * cellH);
    for (let c = c0; c <= c1; c++) {
      const w = Math.min(x1, (c + 1) * cellW) - Math.max(x0, c * cellW);
      sum += luma[r * cols + c] * w * h;
      area += w * h;
    }
  }
  return area > 0 && sum / area < THRESHOLD ? "screen" : "multiply";
}

/** The stroke's footprint in source-image px: its points' bounds padded by
 *  half the stroke width, shifted by the image-crop origin. */
export function highlightBox(
  points: number[],
  strokeWidth: number,
  offX: number,
  offY: number,
): AABB | null {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  const p = strokeWidth / 2;
  return { x: minX - p + offX, y: minY - p + offY, w: maxX - minX + 2 * p, h: maxY - minY + 2 * p };
}

const grids = new WeakMap<HTMLImageElement, LumaGrid | null>();

/** Cached luminance grid for a loaded bitmap; null when it can't be read
 *  (no 2D context, not decoded, or a tainted canvas). */
export function lumaGridFor(img: HTMLImageElement): LumaGrid | null {
  if (grids.has(img)) return grids.get(img) ?? null;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null; // not decoded yet — don't cache
  let grid: LumaGrid | null = null;
  try {
    const s = Math.min(1, GRID_MAX / Math.max(srcW, srcH));
    const cols = Math.max(1, Math.round(srcW * s));
    const rows = Math.max(1, Math.round(srcH * s));
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0, cols, rows);
      grid = lumaGridFromRGBA(g.getImageData(0, 0, cols, rows).data, cols, rows, srcW, srcH);
    }
  } catch {
    grid = null;
  }
  grids.set(img, grid);
  return grid;
}
