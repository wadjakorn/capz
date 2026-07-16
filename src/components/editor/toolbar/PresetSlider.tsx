"use client";

import type { ReactNode } from "react";

/** One quick-set preset: `value` is applied on click; `node` is the button's
 * visual (a glyph/icon that conveys the effect, not the raw number); `title`
 * is the tooltip that still surfaces the exact value. */
export type SliderPreset = { value: number; node: ReactNode; title: string };

/** A small uppercase section eyebrow with a trailing hairline, used to group
 * related controls in the tool-options panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-3)]">
        {children}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" aria-hidden />
    </div>
  );
}

/**
 * Numeric control combining fast preset buttons with a fine-tune slider.
 * The exact value lives in the header readout (and each preset's tooltip) so
 * the buttons themselves can stay purely visual.
 */
export function PresetSlider({
  label,
  value,
  min,
  max,
  step,
  presets,
  onChange,
  round = false,
  unit,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  presets: SliderPreset[];
  onChange: (v: number) => void;
  /** Emit and display integers (size, padding). */
  round?: boolean;
  /** Suffix appended to the readout, e.g. "px". */
  unit?: string;
  /** Custom readout formatter (wins over round/unit), e.g. line-height "1.35×". */
  format?: (v: number) => string;
}) {
  const readout = format
    ? format(value)
    : `${round ? Math.round(value) : value}${unit ? ` ${unit}` : ""}`;
  // A preset reads as active when the value is within half a step of it.
  const tol = step < 1 ? step / 2 : 0.5;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-[var(--fg-2)]">{label}</span>
        <span className="text-xs tabular-nums text-[var(--fg-3)]">{readout}</span>
      </div>
      <div className="flex gap-1">
        {presets.map((p) => {
          const active = Math.abs(value - p.value) <= tol;
          return (
            <button
              key={p.value}
              type="button"
              title={p.title}
              aria-label={`${label} ${p.title}`}
              aria-pressed={active}
              onClick={() => onChange(p.value)}
              className={[
                "flex h-7 flex-1 items-center justify-center rounded-md border transition-colors",
                active
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "border-white/10 bg-white/[0.05] text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              {p.node}
            </button>
          );
        })}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} fine adjust`}
        onChange={(e) =>
          onChange(round ? Math.round(+e.target.value) : +e.target.value)
        }
        className="h-1 w-full cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}

/** Capital "T" sized to the button — the preset's visual is its own size. */
export function SizeGlyph({ px }: { px: number }) {
  return (
    <span
      className="select-none font-semibold leading-none"
      style={{ fontSize: px }}
    >
      T
    </span>
  );
}

/** Three stacked rules whose gap grows with the line-height preset. */
export function LineGapIcon({ gap }: { gap: number }) {
  const ys = [8 - gap, 8, 8 + gap];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {ys.map((y, i) => (
        <line
          key={i}
          x1="3"
          y1={y}
          x2="13"
          y2={y}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** A framed box whose filled core shrinks as padding grows (bigger inset). */
export function PadIcon({ inset }: { inset: number }) {
  const o = 2;
  const s = 16 - o * 2;
  const innerPos = o + inset;
  const innerSize = Math.max(1, s - inset * 2);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect
        x={o}
        y={o}
        width={s}
        height={s}
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.55"
      />
      <rect
        x={innerPos}
        y={innerPos}
        width={innerSize}
        height={innerSize}
        rx="1"
        fill="currentColor"
      />
    </svg>
  );
}
