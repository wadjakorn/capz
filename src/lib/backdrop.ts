/**
 * Editor "backdrop" — an optional padded gradient/solid background rendered
 * behind the captured image (the screenshot-beautifier look). Pure geometry +
 * preset helpers so the rendering (EditorStage) and export math stay testable.
 *
 * The editor already paints its canvas background as a Konva `Rect` sized to the
 * content box and exports that Rect via the published export box. The backdrop
 * simply (a) inflates that box by a uniform padding and (b) fills it with a
 * gradient or procedural pattern instead of a flush solid. See the feature
 * ticket (K5pWujLnPFKv).
 */

import { PATTERNS, type ProceduralPattern, type RenderedPattern } from "./backdropPatterns";

export type BackdropStyle = "gradient" | "solid";

export type AABB = { x: number; y: number; w: number; h: number };

/** Picker grouping. Purely presentational — not persisted. */
export type BackdropCategory = "gradient" | "minimal" | "art";

export type GradientPreset = {
  id: string;
  name: string;
  category: "gradient";
  kind: "linear";
  /** 2–3 CSS colors, top/start → bottom/end. */
  colors: string[];
  /** Direction in degrees: 0 = left→right, 90 = top→bottom, 135 = TR→BL. */
  angle: number;
};

export type PatternPreset = {
  id: string;
  name: string;
  category: "minimal" | "art";
  kind: "pattern";
  pattern: ProceduralPattern;
  /** Flat stand-in painted until the pattern canvas exists (SSR, first frame). */
  base: string;
};

export type BackdropPreset = GradientPreset | PatternPreset;

const linear = (id: string, name: string, colors: string[], angle: number): GradientPreset => ({
  id,
  name,
  category: "gradient",
  kind: "linear",
  colors,
  angle,
});

const pattern = (
  id: keyof typeof PATTERNS,
  name: string,
  category: "minimal" | "art",
  base: string,
): PatternPreset => ({ id, name, category, kind: "pattern", pattern: PATTERNS[id], base });

/**
 * Curated linear gradients — the original v1 set. The first entry is the
 * default / fallback for every unknown preset id.
 */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  linear("slate", "Slate", ["#2b3242", "#1b1f2a"], 135),
  linear("graphite", "Graphite", ["#3a3a3c", "#232325"], 90),
  linear("indigo", "Indigo", ["#4f46e5", "#7c3aed"], 135),
  linear("sunset", "Sunset", ["#f97316", "#db2777"], 135),
  linear("ocean", "Ocean", ["#0ea5e9", "#2563eb"], 135),
  linear("mint", "Mint", ["#10b981", "#0ea5e9"], 135),
  linear("dawn", "Dawn", ["#fda4af", "#a78bfa", "#60a5fa"], 135),
];

/** Procedural presets (lib/backdropPatterns): quiet minimal + art/fashion. */
export const PATTERN_PRESETS: readonly PatternPreset[] = [
  pattern("paper", "Paper", "minimal", "#f3efe6"),
  pattern("ink", "Ink", "minimal", "#0d0e11"),
  pattern("fog", "Fog", "minimal", "#dde1e6"),
  pattern("sand", "Sand", "minimal", "#e0d4bd"),
  pattern("hairline", "Hairline", "minimal", "#f7f6f3"),
  pattern("dotgrid", "Dot Grid", "minimal", "#f4f4f2"),
  pattern("riso", "Risograph", "art", "#f6f1e7"),
  pattern("gingham", "Gingham", "art", "#e8a3a6"),
  pattern("houndstooth", "Houndstooth", "art", "#858078"),
  pattern("tartan", "Tartan", "art", "#7a2228"),
  pattern("breton", "Breton", "art", "#a9adb9"),
  pattern("bauhaus", "Bauhaus", "art", "#efe8d8"),
  pattern("memphis", "Memphis", "art", "#bfe8da"),
  pattern("aura", "Aura", "art", "#d9cdf2"),
  pattern("klein", "Klein", "art", "#002fa7"),
  pattern("terrazzo", "Terrazzo", "art", "#ede4d6"),
  pattern("opart", "Op Art", "art", "#9a9996"),
  pattern("xerox", "Xerox Zine", "art", "#cfceca"),
];

/** Every preset, in picker order. */
export const BACKDROP_PRESETS: readonly BackdropPreset[] = [
  ...GRADIENT_PRESETS,
  ...PATTERN_PRESETS,
];

export const DEFAULT_GRADIENT_ID = GRADIENT_PRESETS[0].id;

/** Resolve any preset id, falling back to the first gradient. */
export function resolvePreset(presetId: string | null | undefined): BackdropPreset {
  return BACKDROP_PRESETS.find((p) => p.id === presetId) ?? GRADIENT_PRESETS[0];
}

/** Resolve a linear preset id, falling back to the first gradient. */
export function resolveGradient(presetId: string | null | undefined): GradientPreset {
  return GRADIENT_PRESETS.find((p) => p.id === presetId) ?? GRADIENT_PRESETS[0];
}

/**
 * Design-unit → image-pixel scale for procedural patterns: 1 on a ~1600px-wide
 * capture, larger for Retina/4K captures so the pattern keeps its size relative
 * to the screenshot instead of shrinking to noise.
 */
export function patternUnit(imageWidth: number): number {
  return Number.isFinite(imageWidth) && imageWidth > 1600 ? imageWidth / 1600 : 1;
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
 * 0° = left→right, 90° = top→bottom, 135° = top-right→bottom-left.
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

/** Konva fill props for a Rect — one of gradient / pattern / flat `fill`. */
export type CanvasFill = {
  fill?: string;
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
  /** Konva types this as an image; at runtime it only needs a CanvasImageSource. */
  fillPatternImage?: HTMLImageElement;
  fillPatternRepeat: "repeat" | "no-repeat";
  fillPatternScaleX: number;
  fillPatternScaleY: number;
};

/** Backdrop appearance fields needed to paint the canvas background. */
export type BackdropFill = {
  style: BackdropStyle;
  presetId: string;
  solidColor: string;
};

/**
 * Konva fill props for the editor's canvas-background Rect.
 *
 * `mode` decides what the exposed area (padding frame + any overflow band
 * around the image) is filled with:
 *  - `"backdrop"` — the configured gradient/solid backdrop. Used whenever the
 *    padded frame is on OR an element overflows the image, so the exposed band
 *    follows the beautifier background instead of a hard fallback color.
 *  - `"flush"` — the plain `canvasColor` (used behind transparent images when
 *    the backdrop is off and nothing overflows).
 *
 * `pattern` is the rendered canvas for a procedural preset (see
 * `renderPattern`); until it exists the preset's flat `base` color stands in.
 *
 * All gradient and pattern keys are always present (undefined / defaults when
 * unused) so react-konva clears stale props when switching style/mode on the
 * same node.
 */
export function canvasFill(
  backdrop: BackdropFill,
  boxW: number,
  boxH: number,
  canvasColor: string,
  mode: "backdrop" | "flush",
  pattern: RenderedPattern | null = null,
): CanvasFill {
  const base: CanvasFill = {
    fill: undefined,
    fillLinearGradientStartPoint: undefined,
    fillLinearGradientEndPoint: undefined,
    fillLinearGradientColorStops: undefined,
    fillPatternImage: undefined,
    fillPatternRepeat: "repeat",
    fillPatternScaleX: 1,
    fillPatternScaleY: 1,
  };
  if (mode === "backdrop" && backdrop.style === "gradient") {
    const g = resolvePreset(backdrop.presetId);
    if (g.kind === "pattern") {
      if (!pattern) return { ...base, fill: g.base };
      return {
        ...base,
        fillPatternImage: pattern.canvas as unknown as HTMLImageElement,
        fillPatternRepeat: pattern.repeat,
        fillPatternScaleX: pattern.scale,
        fillPatternScaleY: pattern.scale,
      };
    }
    const { start, end } = gradientPoints(boxW, boxH, g.angle);
    return {
      ...base,
      fillLinearGradientStartPoint: start,
      fillLinearGradientEndPoint: end,
      fillLinearGradientColorStops: colorStops(g.colors),
    };
  }
  if (mode === "backdrop" && backdrop.style === "solid") {
    return { ...base, fill: backdrop.solidColor };
  }
  return { ...base, fill: canvasColor };
}
