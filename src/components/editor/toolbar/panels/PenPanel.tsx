"use client";

import { PenLine, Spline, Waypoints } from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { CurveGlyph, StraightenGlyph, StrokeGlyph } from "./glyphs";
import { ColorField, Group, IconSegmented, NumericField } from "./kit";
import type { ColorCtx, NumCtx, PenModeCtx } from "./types";
import type { FreehandMode } from "@/stores/editor";
import type { RefObject } from "react";
import type { SliderPreset } from "../PresetSlider";

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
  // The level control means different things per mode; label disambiguates.
  const straighten = penLevelCtx?.label === "Straighten";
  const levelPresets: SliderPreset[] = straighten
    ? [
        { value: 4, node: <StraightenGlyph level={0} />, title: "4 (subtle)" },
        { value: 12, node: <StraightenGlyph level={0.4} />, title: "12" },
        { value: 24, node: <StraightenGlyph level={0.7} />, title: "24" },
        { value: 40, node: <StraightenGlyph level={1} />, title: "40 (max)" },
      ]
    : [
        { value: 0, node: <CurveGlyph level={0} />, title: "0 (off)" },
        { value: 8, node: <CurveGlyph level={0.4} />, title: "8" },
        { value: 18, node: <CurveGlyph level={0.7} />, title: "18" },
        { value: 30, node: <CurveGlyph level={1} />, title: "30 (max)" },
      ];
  return (
    <Group>
      <SectionLabel>Pen</SectionLabel>
      {penModeCtx && (
        <IconSegmented<FreehandMode>
          value={penModeCtx.value}
          onChange={penModeCtx.onChange}
          title="Smoothing"
          ariaLabel="Smoothing"
          options={[
            { value: "raw", title: "Raw", Icon: PenLine },
            { value: "polygon", title: "Polygon", Icon: Waypoints },
            { value: "curve", title: "Curve", Icon: Spline },
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
