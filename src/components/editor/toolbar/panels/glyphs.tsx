"use client";

import { useId } from "react";

/**
 * Glyphs for the tool-option preset chips. Each conveys the *effect* of a
 * value (a thicker bar, a rounder corner, a more opaque swatch) so the chip
 * reads visually while the exact number stays in the readout + tooltip.
 * Siblings of `SizeGlyph`/`LineGapIcon`/`PadIcon` in `PresetSlider.tsx`.
 */

/** A centered horizontal bar whose thickness `t` (px) grows with stroke width. */
export function StrokeGlyph({ t }: { t: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y={8 - t / 2} width="12" height={t} rx={t / 2} fill="currentColor" />
    </svg>
  );
}

/** A square with corner radius `r` (px), growing rounder with the preset. */
export function RadiusGlyph({ r }: { r: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx={r}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A swatch whose fill opacity `o` (0–1) rises with the preset. */
export function OpacityGlyph({ o }: { o: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.5"
      />
      <rect x="4" y="4" width="8" height="8" rx="1.25" fill="currentColor" fillOpacity={o} />
    </svg>
  );
}

/** A magnifier whose lens radius `s` grows with the zoom preset. */
export function ZoomGlyph({ s }: { s: number }) {
  const cx = 7 - (s - 4) * 0.3;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx={cx} cy={cx} r={s} stroke="currentColor" strokeWidth="1.5" />
      <line
        x1={cx + s * 0.72}
        y1={cx + s * 0.72}
        x2="14"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A dot blurred by `b` (SVG stdDeviation), fuzzier with the radius preset. */
export function BlurGlyph({ b }: { b: number }) {
  const id = useId();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={b} />
        </filter>
      </defs>
      <circle cx="8" cy="8" r="4.5" fill="currentColor" filter={b > 0 ? `url(#${id})` : undefined} />
    </svg>
  );
}

/** A filled rounded square sized `s` (px) — a shape-neutral size cue for the
 * sticker/pin size chips (the text tool's `SizeGlyph` renders a literal "T"). */
export function ShapeSizeGlyph({ s }: { s: number }) {
  const o = (16 - s) / 2;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x={o} y={o} width={s} height={s} rx={Math.max(1, s / 5)} fill="currentColor" />
    </svg>
  );
}

/** A polyline that flattens toward a straight edge as `level` (0–1) rises —
 * the pen "Straighten" cue. */
export function StraightenGlyph({ level }: { level: number }) {
  const dip = 5 * (1 - level);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <polyline
        points={`2,11 6,${11 - dip} 10,${5 + dip} 14,5`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** An arc that bends more as `level` (0–1) rises — the pen "Curve" cue. */
export function CurveGlyph({ level }: { level: number }) {
  const cy = 8 - 6 * level;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={`M2 12 Q8 ${cy} 14 12`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
