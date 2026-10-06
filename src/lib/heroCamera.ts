/**
 * Guided camera for the landing hero clips. On narrow frames the clip is
 * followed at its point of action instead of being shrunk whole: each clip
 * carries keyframes `{ t, x, y, s }` — `t` seconds into the clip, `(x, y)` the
 * focus point as fractions of the frame (0–1, resolution-independent), `s` the
 * zoom (1 = whole frame).
 */

export type CameraKey = { t: number; x: number; y: number; s: number };
export type CameraView = { x: number; y: number; s: number };

export const FULL_VIEW: CameraView = { x: 0.5, y: 0.5, s: 1 };

/** Ease-in-out (quadratic) on 0..1. */
export function easeInOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/** The camera at clip time `t`, eased between the surrounding keyframes. */
export function cameraAt(keys: readonly CameraKey[], t: number): CameraView {
  if (!keys.length) return FULL_VIEW;
  if (!(t > keys[0].t)) return pick(keys[0]);
  for (let j = 1; j < keys.length; j++) {
    if (t <= keys[j].t) {
      const a = keys[j - 1];
      const b = keys[j];
      const span = b.t - a.t;
      const e = span > 0 ? easeInOut((t - a.t) / span) : 1;
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, s: a.s + (b.s - a.s) * e };
    }
  }
  return pick(keys[keys.length - 1]);
}

const pick = (k: CameraKey): CameraView => ({ x: k.x, y: k.y, s: k.s });

/**
 * Translate + scale (transform-origin 0 0) that centres the focus point in a
 * `w × h` frame, clamped so the frame never shows past the video's edges.
 * Zoom below 1 is treated as 1.
 */
export function cameraTransform(view: CameraView, w: number, h: number): { tx: number; ty: number; s: number } {
  const s = Math.max(1, Number.isFinite(view.s) ? view.s : 1);
  const tx = Math.min(0, Math.max(w - w * s, w / 2 - view.x * w * s));
  const ty = Math.min(0, Math.max(h - h * s, h / 2 - view.y * h * s));
  return { tx, ty, s };
}

/** The visible part of the frame as fractions (for the mini-map). */
export function viewportRect(view: CameraView, w: number, h: number): { left: number; top: number; width: number; height: number } {
  const { tx, ty, s } = cameraTransform(view, w, h);
  return { left: -tx / (w * s), top: -ty / (h * s), width: 1 / s, height: 1 / s };
}
