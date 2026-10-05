"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CaseUpper,
  Circle as CircleIcon,
  Hash,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { ShapeSizeGlyph, StrokeGlyph } from "./glyphs";
import { ColorField, Group, IconSegmented, NumericField } from "./kit";
import type {
  ColorCtx,
  NumCtx,
  PinLabelStyleCtx,
  PinShapeCtx,
  PinTailCtx,
} from "./types";
import type { PinLabelStyle, PinShapeKind, PinTailDir } from "@/stores/editor";
import { formatPinLabel } from "@/lib/pinLabel";
import type { RefObject } from "react";
import { useT } from "@/i18n/useT";

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
  pinLabelStyleCtx,
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
  /** Numeric vs A–Z labels. Unlike `numbering`, this shows in BOTH modes:
   * it edits the selected pin, or the default for the next one. */
  pinLabelStyleCtx: PinLabelStyleCtx | null;
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
  const { t } = useT();
  return (
    <Group>
      <SectionLabel>{t("editor.pin.pin")}</SectionLabel>
      {pinShapeCtx && (
        <IconSegmented<PinShapeKind>
          value={pinShapeCtx.value}
          onChange={pinShapeCtx.onChange}
          title={t("editor.pin.shape")}
          ariaLabel={t("editor.pin.shape")}
          options={[
            { value: "circle", title: t("editor.panel.circle"), Icon: CircleIcon },
            { value: "bubble", title: t("editor.pin.bubble"), Icon: MessageCircle },
            { value: "mappin", title: t("editor.pin.mapPin"), Icon: MapPin },
          ]}
        />
      )}
      {pinTailCtx && pinShapeCtx?.value === "bubble" && (
        <IconSegmented<PinTailDir>
          value={pinTailCtx.value}
          onChange={pinTailCtx.onChange}
          title={t("editor.pin.tailDir")}
          ariaLabel={t("editor.pin.tailDir")}
          options={[
            { value: "up", title: t("editor.pin.tailUp"), Icon: ArrowUp },
            { value: "down", title: t("editor.pin.tailDown"), Icon: ArrowDown },
            { value: "left", title: t("editor.pin.tailLeft"), Icon: ArrowLeft },
            { value: "right", title: t("editor.pin.tailRight"), Icon: ArrowRight },
          ]}
        />
      )}

      {pinLabelStyleCtx && (
        <IconSegmented<PinLabelStyle>
          value={pinLabelStyleCtx.value}
          onChange={pinLabelStyleCtx.onChange}
          title={t("editor.pin.labelStyle")}
          ariaLabel={t("editor.pin.labelStyle")}
          options={[
            { value: "numeric", title: t("editor.pin.numbers"), Icon: Hash },
            { value: "alpha", title: t("editor.pin.letters"), Icon: CaseUpper },
          ]}
        />
      )}

      {colorCtx && (
        <ColorField
          ctx={colorCtx}
          inputRef={colorInputRef}
          title={selected ? t("editor.panel.colorSelected") : t("editor.panel.colorDefault")}
        />
      )}
      {pinLabelCtx && <ColorField ctx={pinLabelCtx} title={t("editor.pin.labelColor")} />}
      {pinBorderCtx && <ColorField ctx={pinBorderCtx} title={t("editor.pin.borderColor")} />}
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
          <SectionLabel>{t("editor.pin.numbering")}</SectionLabel>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/80">
            <label className="flex items-center gap-1">
              {t("editor.pin.next")}
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
            {pinLabelStyleCtx?.value === "alpha" && (
              <span className="text-foreground/60" title={t("editor.pin.nextLabel")}>
                → {formatPinLabel(numbering.next, "alpha")}
              </span>
            )}
            <button
              type="button"
              onClick={numbering.onSave}
              title={t("editor.pin.saveHint")}
              className="rounded-md px-2 py-1 text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={numbering.onClear}
              title={t("editor.pin.clearHint", { n: numbering.clearTo })}
              className="rounded-md px-2 py-1 text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              {t("common.clear")}
            </button>
            <button
              type="button"
              onClick={numbering.onToggleContinuity}
              title={t("editor.pin.continueHint")}
              className={[
                "rounded-md px-2 py-1 transition-colors",
                numbering.continuityOn
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-foreground/85 hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              {t("editor.pin.continue")}
            </button>
          </div>
        </>
      )}
    </Group>
  );
}
