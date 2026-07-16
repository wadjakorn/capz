"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle as CircleIcon,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { ShapeSizeGlyph, StrokeGlyph } from "./glyphs";
import { ColorField, Group, IconSegmented, NumericField } from "./kit";
import type {
  ColorCtx,
  NumCtx,
  PinShapeCtx,
  PinTailCtx,
} from "./types";
import type { PinShapeKind, PinTailDir } from "@/stores/editor";
import type { RefObject } from "react";

/** Pin tool: shape (+ bubble tail), the numbered colors, size (12–120), border
 * width (0–100), and the capture-to-capture numbering controls. */
export function PinPanel({
  colorCtx,
  sizeCtx,
  pinLabelCtx,
  pinBorderCtx,
  pinBorderWidthCtx,
  pinShapeCtx,
  pinTailCtx,
  colorInputRef,
  selected,
  numbering,
}: {
  colorCtx: ColorCtx | null;
  sizeCtx: NumCtx | null;
  pinLabelCtx: ColorCtx | null;
  pinBorderCtx: ColorCtx | null;
  pinBorderWidthCtx: NumCtx | null;
  pinShapeCtx: PinShapeCtx | null;
  pinTailCtx: PinTailCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
  /** Capture-to-capture numbering controls (tool mode only, not per-pin). */
  numbering: {
    next: number;
    onChangeNext: (v: number) => void;
    onSave: () => void;
    onClear: () => void;
    onToggleContinuity: () => void;
    continuityOn: boolean;
    clearTo: number;
  } | null;
}) {
  return (
    <Group>
      <SectionLabel>Pin</SectionLabel>
      {pinShapeCtx && (
        <IconSegmented<PinShapeKind>
          value={pinShapeCtx.value}
          onChange={pinShapeCtx.onChange}
          title="Pin shape"
          ariaLabel="Pin shape"
          options={[
            { value: "circle", title: "Circle", Icon: CircleIcon },
            { value: "bubble", title: "Message bubble", Icon: MessageCircle },
            { value: "mappin", title: "Map pin", Icon: MapPin },
          ]}
        />
      )}
      {pinTailCtx && pinShapeCtx?.value === "bubble" && (
        <IconSegmented<PinTailDir>
          value={pinTailCtx.value}
          onChange={pinTailCtx.onChange}
          title="Tail direction"
          ariaLabel="Tail direction"
          options={[
            { value: "up", title: "Tail up", Icon: ArrowUp },
            { value: "down", title: "Tail down", Icon: ArrowDown },
            { value: "left", title: "Tail left", Icon: ArrowLeft },
            { value: "right", title: "Tail right", Icon: ArrowRight },
          ]}
        />
      )}

      {colorCtx && (
        <ColorField
          ctx={colorCtx}
          inputRef={colorInputRef}
          title={selected ? "Edit selected element color" : "Default color for next element"}
        />
      )}
      {pinLabelCtx && <ColorField ctx={pinLabelCtx} title="Pin number color" />}
      {pinBorderCtx && <ColorField ctx={pinBorderCtx} title="Pin border color" />}
      {sizeCtx && (
        <NumericField
          ctx={sizeCtx}
          unit="px"
          presets={[
            { value: 24, node: <ShapeSizeGlyph s={9} />, title: "24 px" },
            { value: 48, node: <ShapeSizeGlyph s={12} />, title: "48 px" },
            { value: 80, node: <ShapeSizeGlyph s={16} />, title: "80 px" },
            { value: 120, node: <ShapeSizeGlyph s={20} />, title: "120 px" },
          ]}
        />
      )}
      {pinBorderWidthCtx && (
        <NumericField
          ctx={pinBorderWidthCtx}
          unit="px"
          presets={[
            { value: 0, node: <StrokeGlyph t={0.75} />, title: "0 px" },
            { value: 4, node: <StrokeGlyph t={1.5} />, title: "4 px" },
            { value: 12, node: <StrokeGlyph t={3} />, title: "12 px" },
            { value: 40, node: <StrokeGlyph t={5} />, title: "40 px" },
          ]}
        />
      )}

      {numbering && (
        <>
          <SectionLabel>Numbering</SectionLabel>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/80">
            <label className="flex items-center gap-1">
              Next:
              <input
                type="number"
                min={0}
                value={numbering.next}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v >= 0) numbering.onChangeNext(v);
                }}
                className="w-14 rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-center text-xs text-foreground outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={numbering.onSave}
              title="Persist current as latest used number"
              className="rounded-md px-2 py-1 text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={numbering.onClear}
              title={`Clear persisted (reset to ${numbering.clearTo})`}
              className="rounded-md px-2 py-1 text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={numbering.onToggleContinuity}
              title="Toggle continuity across captures"
              className={[
                "rounded-md px-2 py-1 transition-colors",
                numbering.continuityOn
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-foreground/85 hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              Continue
            </button>
          </div>
        </>
      )}
    </Group>
  );
}
