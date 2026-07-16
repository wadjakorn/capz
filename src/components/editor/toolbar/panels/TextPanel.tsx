"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  LineGapIcon,
  PadIcon,
  PresetSlider,
  SectionLabel,
  SizeGlyph,
} from "../PresetSlider";
import { Group, ToggleIconButton, withBold, withDeco, withItalic } from "./kit";
import { THAI_SANS_STACK } from "@/lib/config";
import type { ColorCtx, NumCtx, TextStyleCtx } from "./types";
import type { Dispatch, RefObject, SetStateAction } from "react";

const FONT_FAMILIES: { label: string; value: string }[] = [
  // "Sans" leads with Noto Sans Thai so Thai glyphs render cleanly; falls back
  // to the system sans for Latin. The other families append Noto Sans Thai as a
  // last resort so Thai still renders (per-glyph fallback) without a loaded
  // serif/mono/cursive Thai face.
  { label: "Sans", value: THAI_SANS_STACK },
  { label: "Serif", value: 'serif, "Noto Sans Thai"' },
  { label: "Mono", value: 'ui-monospace, monospace, "Noto Sans Thai"' },
  { label: "Cursive", value: 'cursive, "Noto Sans Thai"' },
];

/** Text tool: font family/size, line height, weight/style/decoration/align,
 * color, and optional background fill + padding. */
export function TextPanel({
  textStyleCtx: tsc,
  sizeCtx,
  colorCtx,
  colorInputRef,
  lastBgColor,
  setLastBgColor,
}: {
  textStyleCtx: TextStyleCtx;
  sizeCtx: NumCtx | null;
  colorCtx: ColorCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  lastBgColor: string;
  setLastBgColor: Dispatch<SetStateAction<string>>;
}) {
  const bold = tsc.fontStyle.includes("bold");
  const italic = tsc.fontStyle.includes("italic");
  const ul = tsc.textDecoration.includes("underline");
  const st = tsc.textDecoration.includes("line-through");
  return (
    <Group>
      <SectionLabel>Type</SectionLabel>

      <label
        className="flex items-center justify-between gap-2 text-xs text-[var(--fg-2)]"
        title="Font family"
      >
        <span>Font</span>
        <select
          value={tsc.fontFamily}
          onChange={(e) => tsc.setFontFamily(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-foreground outline-none focus:border-[var(--accent)]"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {sizeCtx && (
        <PresetSlider
          label="Size"
          value={sizeCtx.value}
          min={sizeCtx.min}
          max={sizeCtx.max}
          step={sizeCtx.step}
          round
          unit="px"
          onChange={(v) => sizeCtx.onChange(v)}
          presets={[
            { value: 16, node: <SizeGlyph px={10} />, title: "16 px" },
            { value: 24, node: <SizeGlyph px={13} />, title: "24 px" },
            { value: 48, node: <SizeGlyph px={17} />, title: "48 px" },
            { value: 96, node: <SizeGlyph px={21} />, title: "96 px" },
          ]}
        />
      )}

      <PresetSlider
        label="Line height"
        value={tsc.lineHeight}
        min={1}
        max={2.5}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(v) => tsc.setLineHeight(v)}
        presets={[
          { value: 1, node: <LineGapIcon gap={2.5} />, title: "1.0× tight" },
          { value: 1.25, node: <LineGapIcon gap={4} />, title: "1.25× normal" },
          { value: 1.5, node: <LineGapIcon gap={5.5} />, title: "1.5× loose" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <ToggleIconButton active={bold} onClick={() => tsc.setFontStyle(withBold(tsc.fontStyle, !bold))} title="Bold" Icon={Bold} />
          <ToggleIconButton active={italic} onClick={() => tsc.setFontStyle(withItalic(tsc.fontStyle, !italic))} title="Italic" Icon={Italic} />
          <ToggleIconButton active={ul} onClick={() => tsc.setTextDecoration(withDeco(tsc.textDecoration, "underline", !ul))} title="Underline" Icon={Underline} />
          <ToggleIconButton active={st} onClick={() => tsc.setTextDecoration(withDeco(tsc.textDecoration, "line-through", !st))} title="Strike" Icon={Strikethrough} />
        </div>
        <div className="flex items-center gap-0.5" role="group" aria-label="Text alignment">
          <ToggleIconButton active={tsc.align === "left"} onClick={() => tsc.setAlign("left")} title="Align left" Icon={AlignLeft} />
          <ToggleIconButton active={tsc.align === "center"} onClick={() => tsc.setAlign("center")} title="Align center" Icon={AlignCenter} />
          <ToggleIconButton active={tsc.align === "right"} onClick={() => tsc.setAlign("right")} title="Align right" Icon={AlignRight} />
        </div>
      </div>

      {colorCtx && (
        <label
          className="flex items-center justify-between gap-2 text-xs text-[var(--fg-2)]"
          title="Text color"
        >
          <span>Color</span>
          <input
            ref={colorInputRef}
            type="color"
            value={colorCtx.value}
            onChange={(e) => colorCtx.onChange(e.target.value)}
            className="h-6 w-9 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
          />
        </label>
      )}

      <SectionLabel>Background</SectionLabel>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            tsc.setBackgroundColor(tsc.backgroundColor === null ? lastBgColor : null)
          }
          aria-pressed={tsc.backgroundColor !== null}
          title="Text background on/off"
          className={[
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            tsc.backgroundColor !== null
              ? "bg-[var(--accent)] text-[var(--accent-fg)]"
              : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
          ].join(" ")}
        >
          Fill {tsc.backgroundColor !== null ? "on" : "off"}
        </button>
        {tsc.backgroundColor !== null && (
          <input
            type="color"
            value={tsc.backgroundColor}
            title="Background color"
            onChange={(e) => {
              setLastBgColor(e.target.value);
              tsc.setBackgroundColor(e.target.value);
            }}
            className="h-6 w-9 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
          />
        )}
      </div>

      {tsc.backgroundColor !== null && (
        <PresetSlider
          label="Padding"
          value={tsc.bgPadding}
          min={0}
          max={256}
          step={1}
          round
          unit="px"
          onChange={(v) => tsc.setBgPadding(v)}
          presets={[
            { value: 0, node: <PadIcon inset={1} />, title: "None" },
            { value: 16, node: <PadIcon inset={3} />, title: "16 px" },
            { value: 40, node: <PadIcon inset={5} />, title: "40 px" },
            { value: 128, node: <PadIcon inset={6} />, title: "128 px" },
          ]}
        />
      )}
    </Group>
  );
}
