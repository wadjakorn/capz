"use client";

import type { ComponentType, ReactNode, RefObject } from "react";
import { PresetSlider, type SliderPreset } from "../PresetSlider";
import type { ColorCtx, NumCtx, TextDecoration, TextFontStyle } from "./types";

type IconType = ComponentType<{ className?: string }>;

/** Dashed horizontal line — no lucide equivalent, so a tiny inline SVG. */
export function DashLineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray="3 3"
      className={className}
      aria-hidden
    >
      <line x1="1.5" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}

/** The 7×7 icon toggle used across every panel (shape pickers, dash, link…). */
export function ToggleIconButton({
  active,
  onClick,
  title,
  Icon,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  Icon: IconType;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={[
        "flex h-7 w-7 items-center justify-center rounded transition-colors",
        active
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** A row of mutually-exclusive icon toggles bound to a single value. */
export function IconSegmented<V extends string>({
  value,
  onChange,
  options,
  title,
  ariaLabel,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; title: string; Icon: IconType }[];
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      title={title}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <ToggleIconButton
          key={o.value}
          active={value === o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          Icon={o.Icon}
        />
      ))}
    </div>
  );
}

/** Label + color swatch, laid out like the text panel's fields (full-width row). */
export function ColorField({
  ctx,
  title,
  inputRef,
}: {
  ctx: ColorCtx;
  title?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label
      className="flex items-center justify-between gap-2 text-xs text-[var(--fg-2)]"
      title={title}
    >
      <span>{ctx.label}</span>
      <input
        ref={inputRef}
        type="color"
        value={ctx.value}
        onChange={(e) => ctx.onChange(e.target.value)}
        className="h-6 w-9 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
      />
    </label>
  );
}

/** A numeric control rendered as preset chips + fine slider (`PresetSlider`)
 * driven by the shared `NumCtx`. Integer by default (all tool controls are). */
export function NumericField({
  ctx,
  presets,
  unit,
  format,
  round = true,
}: {
  ctx: NumCtx;
  presets: SliderPreset[];
  unit?: string;
  format?: (v: number) => string;
  round?: boolean;
}) {
  return (
    <PresetSlider
      label={ctx.label}
      value={ctx.value}
      min={ctx.min}
      max={ctx.max}
      step={ctx.step}
      round={round}
      unit={unit}
      format={format}
      presets={presets}
      onChange={ctx.onChange}
    />
  );
}

export function Group({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

// --- text style bit helpers (moved from Toolbar) ---------------------------

export function withBold(s: TextFontStyle, on: boolean): TextFontStyle {
  const italic = s.includes("italic");
  if (on) return italic ? "italic bold" : "bold";
  return italic ? "italic" : "normal";
}
export function withItalic(s: TextFontStyle, on: boolean): TextFontStyle {
  const bold = s.includes("bold");
  if (on) return bold ? "italic bold" : "italic";
  return bold ? "bold" : "normal";
}
export function withDeco(
  d: TextDecoration,
  which: "underline" | "line-through",
  on: boolean,
): TextDecoration {
  const has = (k: "underline" | "line-through") => d.includes(k);
  const u = which === "underline" ? on : has("underline");
  const s = which === "line-through" ? on : has("line-through");
  if (u && s) return "underline line-through";
  if (u) return "underline";
  if (s) return "line-through";
  return "";
}
