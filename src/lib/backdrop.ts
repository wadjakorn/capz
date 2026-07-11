/**
 * Editor "backdrop" — an optional padded gradient/solid background rendered
 * behind the captured image (the screenshot-beautifier look). Pure geometry +
 * preset helpers so the rendering (EditorStage) and export math stay testable.
 *
 * The editor already paints its canvas background as a Konva `Rect` sized to the
 * content box and exports that Rect via the published export box. The backdrop
 * simply (a) inflates that box by a uniform padding and (b) fills it with a
 * gradient instead of a flush solid. See the feature ticket (K5pWujLnPFKv).
 */

export type BackdropStyle = "gradient" | "solid";

export type AABB = { x: number; y: number; w: number; h: number };

export type GradientPreset = {
  id: string;
  name: string;
  /** 2–3 CSS colors, top/start → bottom/end. */
  colors: string[];
  /** Direction in degrees: 0 = left→right, 90 = top→bottom, 135 = TL→BR. */
  angle: number;
};

/**
 * Curated gradient presets. Kept small and tasteful (no custom-gradient editor
 * in v1). The first entry is the default / fallback.
 */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  { id: "slate", name: "Slate", colors: ["#2b3242", "#1b1f2a"], angle: 135 },
  { id: "graphite", name: "Graphite", colors: ["#3a3a3c", "#232325"], angle: 90 },
  { id: "indigo", name: "Indigo", colors: ["#4f46e5", "#7c3aed"], angle: 135 },
  { id: "sunset", name: "Sunset", colors: ["#f97316", "#db2777"], angle: 135 },
  { id: "ocean", name: "Ocean", colors: ["#0ea5e9", "#2563eb"], angle: 135 },
  { id: "mint", name: "Mint", colors: ["#10b981", "#0ea5e9"], angle: 135 },
  { id: "dawn", name: "Dawn", colors: ["#fda4af", "#a78bfa", "#60a5fa"], angle: 135 },
] as const;

export const DEFAULT_GRADIENT_ID = GRADIENT_PRESETS[0].id;

/** Resolve a preset id to its definition, falling back to the first preset. */
export function resolveGradient(presetId: string | null | undefined): GradientPreset {
  return GRADIENT_PRESETS.find((p) => p.id === presetId) ?? GRADIENT_PRESETS[0];
}

/**
 * Inflate an AABB by a uniform padding on all sides. Negative/NaN padding is
 * clamped to 0, so it can never shrink the box. Used to expand both the drawn
 * background Rect and the published export box when the backdrop is enabled.
 */
export function paddedBox(box: AABB, padding: number): AABB {
  const p = Number.isFinite(padding) && padding > 0 ? padding : 0;
  return { x: box.x - p, y: box.y - p, w: box.w + 2 * p, h: box.h + 2 * p };
}

/**
 * Konva `fillLinearGradientColorStops` array — `[offset, color, ...]` with the
 * colors distributed evenly across `[0, 1]`. A single color yields a flat
 * two-stop ramp so the gradient still renders.
 */
export function colorStops(colors: string[]): Array<number | string> {
  const cs = colors.length > 0 ? colors : ["#000000"];
  if (cs.length === 1) return [0, cs[0], 1, cs[0]];
  const last = cs.length - 1;
  const out: Array<number | string> = [];
  for (let i = 0; i < cs.length; i++) {
    out.push(i / last, cs[i]);
  }
  return out;
}

/**
 * Start/end points (in the Rect's local coordinate space, i.e. `0..w`, `0..h`)
 * for a linear gradient spanning the box corner-to-corner along `angleDeg`.
 * 0° = left→right, 90° = top→bottom, 135° = top-left→bottom-right.
 */
export function gradientPoints(
  w: number,
  h: number,
  angleDeg: number,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Half-length so the ramp reaches the far corner along the direction vector.
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return {
    start: { x: cx - dx * half, y: cy - dy * half },
    end: { x: cx + dx * half, y: cy + dy * half },
  };
}
