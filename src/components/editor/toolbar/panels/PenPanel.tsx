"use client";

import { PenLine, Spline, Waypoints } from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { CurveGlyph, StraightenGlyph, StrokeGlyph } from "./glyphs";
import { ColorField, Group, IconSegmented, NumericField } from "./kit";
import type { ColorCtx, NumCtx, PenModeCtx } from "./types";
import type { FreehandMode } from "@/stores/editor";
import type { RefObject } from "react";
import type { SliderPreset } from "../PresetSlider";
import { useT } from "@/i18n/useT";

/** Pen tool: stroke color + width (1–40), smoothing mode, and a mode-specific
 * "Straighten" (polygon, 2–40) or "Curve" (curve, 0–30) level. */
export function PenPanel({
  colorCtx,
  widthCtx,
  penLevelCtx,
  penModeCtx,
  colorInputRef,
  selected,
}: {
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  penLevelCtx: NumCtx | null;
  penModeCtx: PenModeCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
}) {
  const { t } = useT();
  // The level control means different things per mode. Keyed on the mode, not
  // the (translated) label.
  const straighten = penModeCtx?.value === "polygon";
  const levelPresets: SliderPreset[] = straighten
    ? [
        { value: 4, node: <StraightenGlyph level={0} />, title: t("editor.panel.presetSubtle", { n: 4 }) },
        { value: 12, node: <StraightenGlyph level={0.4} />, title: "12" },
        { value: 24, node: <StraightenGlyph level={0.7} />, title: "24" },
        { value: 40, node: <StraightenGlyph level={1} />, title: t("editor.panel.presetMax", { n: 40 }) },
      ]
    : [
        { value: 0, node: <CurveGlyph level={0} />, title: t("editor.panel.presetOff", { n: 0 }) },
        { value: 8, node: <CurveGlyph level={0.4} />, title: "8" },
        { value: 18, node: <CurveGlyph level={0.7} />, title: "18" },
        { value: 30, node: <CurveGlyph level={1} />, title: t("editor.panel.presetMax", { n: 30 }) },
      ];
  return (
    <Group>
      <SectionLabel>{t("editor.panel.pen")}</SectionLabel>
      {penModeCtx && (
        <IconSegmented<FreehandMode>
          value={penModeCtx.value}
          onChange={penModeCtx.onChange}
          title={t("editor.panel.smoothing")}
          ariaLabel={t("editor.panel.smoothing")}
          options={[
            { value: "raw", title: t("editor.panel.smoothRaw"), Icon: PenLine },
            { value: "polygon", title: t("editor.panel.smoothPolygon"), Icon: Waypoints },
            { value: "curve", title: t("editor.panel.smoothCurve"), Icon: Spline },
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
      {widthCtx && (
        <NumericField
          ctx={widthCtx}
          unit="px"
          presets={[
            { value: 2, node: <StrokeGlyph t={1} />, title: "2 px" },
            { value: 6, node: <StrokeGlyph t={2.5} />, title: "6 px" },
            { value: 16, node: <StrokeGlyph t={4} />, title: "16 px" },
            { value: 32, node: <StrokeGlyph t={5.5} />, title: "32 px" },
          ]}
        />
      )}
      {penLevelCtx && <NumericField ctx={penLevelCtx} presets={levelPresets} />}
    </Group>
  );
}
