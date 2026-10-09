import type Konva from "konva";

/**
 * Highlighter blending (CP-0066). `multiply` keeps dark text crisp on light
 * backgrounds but can only darken, so on dark surfaces the stroke vanishes;
 * `screen` tints dark surfaces but washes out on light ones. Each pixel of a
 * stroke is therefore split by the base image's luminance under it: the dark
 * share is drawn with `screen`, the light share with `multiply`, with a soft
 * ramp between so a stroke crossing light and dark has no seam.
 */

/** Luminance at or below LO → all screen; at or above HI → all multiply. */
const LO = 0.4;
const HI = 0.6;
/** Long side of the cached mask, in px (it is scaled up with smoothing). */
const MASK_MAX = 2048;
/** Largest offscreen buffer side, in device px. */
const BUF_MAX = 8192;

/** Share of a pixel (0..1) that should be screened. Transparent counts as white. */
export function darkWeight(r: number, g: number, b: number, a: number): number {
  const alpha = a / 255;
  const l = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * alpha + (1 - alpha);
  return Math.min(1, Math.max(0, (HI - l) / (HI - LO)));
}

/** In place: every pixel becomes black with alpha = its dark weight. */
export function toDarkMask(data: Uint8ClampedArray): void {
  for (let o = 0; o < data.length; o += 4) {
    const w = darkWeight(data[o], data[o + 1], data[o + 2], data[o + 3]);
    data[o] = data[o + 1] = data[o + 2] = 0;
    data[o + 3] = Math.round(w * 255);
  }
}

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
type Rect = { x: number; y: number; w: number; h: number };

/** Device-pixel box of a stroke (points padded by half its width) under `m`,
 *  rounded out and clipped to the canvas; null when nothing is visible. */
export function strokeDeviceRect(
  points: number[],
  strokeWidth: number,
  m: Matrix,
  canvasW: number,
  canvasH: number,
): Rect | null {
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
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of [
    [minX - p, minY - p],
    [maxX + p, minY - p],
    [minX - p, maxY + p],
    [maxX + p, maxY + p],
  ]) {
    const dx = m.a * x + m.c * y + m.e;
    const dy = m.b * x + m.d * y + m.f;
    x0 = Math.min(x0, dx);
    x1 = Math.max(x1, dx);
    y0 = Math.min(y0, dy);
    y1 = Math.max(y1, dy);
  }
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(canvasW, Math.ceil(x1));
  const bottom = Math.min(canvasH, Math.ceil(y1));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

const masks = new WeakMap<HTMLImageElement, HTMLCanvasElement | null>();

/** Cached dark mask of a loaded bitmap; null when it can't be read
 *  (no 2D context, not decoded, or a tainted canvas). */
export function darkMaskFor(img: HTMLImageElement): HTMLCanvasElement | null {
  if (masks.has(img)) return masks.get(img) ?? null;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null; // not decoded yet — don't cache
  let mask: HTMLCanvasElement | null = null;
  try {
    const s = Math.min(1, MASK_MAX / Math.max(srcW, srcH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * s));
    canvas.height = Math.max(1, Math.round(srcH * s));
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = g.getImageData(0, 0, canvas.width, canvas.height);
      toDarkMask(data.data);
      g.putImageData(data, 0, 0);
      mask = canvas;
    }
  } catch {
    mask = null;
  }
  masks.set(img, mask);
  return mask;
}

let bufs: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

/** Draw the stroke (opaque) into `g` and keep only the share `op` leaves of
 *  the mask: `destination-in` → dark share, `destination-out` → light share. */
function strokePart(
  g: CanvasRenderingContext2D,
  shape: Konva.Line,
  r: Rect,
  m: DOMMatrix,
  maskAt: () => void,
  op: GlobalCompositeOperation,
) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, r.w, r.h);
  g.globalCompositeOperation = "source-over";
  g.setTransform(m.a, m.b, m.c, m.d, m.e - r.x, m.f - r.y);
  const pts = shape.points();
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = shape.stroke() as string;
  g.lineWidth = shape.strokeWidth();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke();
  g.globalCompositeOperation = op;
  maskAt();
  g.restore();
}

/**
 * Konva `sceneFunc` for a highlighter `Line` (straight segments, no tension)
 * over the base image `img`, cropped to `crop` (source px) and drawn at the
 * origin of the line's parent. Only the visible image is sampled; over the
 * backdrop beyond it the stroke multiplies. Falls back to a plain
 * multiply stroke when the image can't be sampled. Pair it with
 * {@link highlighterHitFunc} so hit-testing keeps the normal stroke shape.
 */
export function highlighterSceneFunc(
  img: HTMLImageElement | undefined,
  crop: Rect,
) {
  return (context: Konva.Context, shape: Konva.Shape) => {
    const line = shape as Konva.Line;
    const raw = context._context;
    const mask = img ? darkMaskFor(img) : null;
    const m = raw.getTransform();
    const r = mask
      ? strokeDeviceRect(line.points(), line.strokeWidth(), m, raw.canvas.width, raw.canvas.height)
      : null;
    if (!mask || !img || !r || r.w > BUF_MAX || r.h > BUF_MAX) {
      raw.globalCompositeOperation = "multiply";
      highlighterHitFunc(context, shape);
      return;
    }
    if (!bufs) bufs = [document.createElement("canvas"), document.createElement("canvas")];
    const [dark, light] = bufs;
    for (const b of bufs) {
      if (b.width < r.w) b.width = r.w;
      if (b.height < r.h) b.height = r.h;
    }
    const dg = dark.getContext("2d");
    const lg = light.getContext("2d");
    if (!dg || !lg) {
      raw.globalCompositeOperation = "multiply";
      highlighterHitFunc(context, shape);
      return;
    }
    // The mask lives in the parent's (image) space, not the line's own
    // rotated/moved space: undo the line's local transform before drawing it.
    const inv = line.getTransform().copy().invert().getMatrix();
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const sx = mask.width / srcW;
    const sy = mask.height / srcH;
    const maskOn = (g: CanvasRenderingContext2D) => () => {
      g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
      g.imageSmoothingEnabled = true;
      g.drawImage(
        mask,
        crop.x * sx,
        crop.y * sy,
        crop.w * sx,
        crop.h * sy,
        0,
        0,
        crop.w,
        crop.h,
      );
    };
    strokePart(dg, line, r, m, maskOn(dg), "destination-in");
    strokePart(lg, line, r, m, maskOn(lg), "destination-out");
    raw.save();
    raw.setTransform(1, 0, 0, 1, 0, 0);
    raw.globalCompositeOperation = "multiply";
    raw.drawImage(light, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
    raw.globalCompositeOperation = "screen";
    raw.drawImage(dark, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
    raw.restore();
  };
}

/** The stock `Line` path (used for hit-testing and the multiply fallback). */
export function highlighterHitFunc(context: Konva.Context, shape: Konva.Shape) {
  const pts = (shape as Konva.Line).points();
  if (pts.length < 2) return;
  context.beginPath();
  context.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) context.lineTo(pts[i], pts[i + 1]);
  context.strokeShape(shape);
}
