"use client";

import { Circle as CircleIcon, Link2, Link2Off, Square } from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { OpacityGlyph, StrokeGlyph, ZoomGlyph } from "./glyphs";
import {
  ColorField,
  DashLineIcon,
  Group,
  IconSegmented,
  NumericField,
  ToggleIconButton,
} from "./kit";
import type {
  ColorCtx,
  MagnifyShapeCtx,
  NumCtx,
  ToggleCtx,
} from "./types";
import type { MagnifyShape } from "@/stores/editor";
import type { SliderPreset } from "../PresetSlider";
import type { RefObject } from "react";

const borderWidthPresets: SliderPreset[] = [
  { value: 2, node: <StrokeGlyph t={1} />, title: "2 px" },
  { value: 4, node: <StrokeGlyph t={2} />, title: "4 px" },
  { value: 8, node: <StrokeGlyph t={3.5} />, title: "8 px" },
  { value: 14, node: <StrokeGlyph t={5} />, title: "14 px" },
];

/** Magnify tool. Loupe shape + zoom (2–8×), then border color/link/width, an
 * independent "Src" width when unlinked (2–20), the connector dash toggle, and
 * area opacity (0–100%). */
export function MagnifyPanel({
  colorCtx,
  widthCtx,
  cornerCtx,
  penLevelCtx,
  sizeCtx,
  magnifyShapeCtx,
  magnifyLinkCtx,
  arrowDashCtx,
  colorInputRef,
}: {
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  cornerCtx: NumCtx | null;
  penLevelCtx: NumCtx | null;
  sizeCtx: NumCtx | null;
  magnifyShapeCtx: MagnifyShapeCtx | null;
  magnifyLinkCtx: ToggleCtx | null;
  arrowDashCtx: ToggleCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <Group>
      <SectionLabel>Loupe</SectionLabel>
      {magnifyShapeCtx && (
        <IconSegmented<MagnifyShape>
          value={magnifyShapeCtx.value}
          onChange={magnifyShapeCtx.onChange}
          title="Loupe shape"
          ariaLabel="Loupe shape"
          options={[
            { value: "circle", title: "Circle", Icon: CircleIcon },
            { value: "rect", title: "Rectangle", Icon: Square },
          ]}
        />
      )}
      {sizeCtx && (
        <NumericField
          ctx={sizeCtx}
          format={(v) => `${Math.round(v)}×`}
          presets={[
            { value: 2, node: <ZoomGlyph s={2.5} />, title: "2×" },
            { value: 3, node: <ZoomGlyph s={3.5} />, title: "3×" },
            { value: 4, node: <ZoomGlyph s={4.5} />, title: "4×" },
            { value: 6, node: <ZoomGlyph s={6} />, title: "6×" },
          ]}
        />
      )}

      <SectionLabel>Border</SectionLabel>
      {colorCtx && (
        <ColorField ctx={colorCtx} inputRef={colorInputRef} title="Border color" />
      )}
      {(magnifyLinkCtx || arrowDashCtx) && (
        <div className="flex items-center gap-0.5">
          {magnifyLinkCtx && (
            <ToggleIconButton
              active={magnifyLinkCtx.value}
              onClick={() => magnifyLinkCtx.onChange(!magnifyLinkCtx.value)}
              title={
                magnifyLinkCtx.value
                  ? "Borders linked — click to set separately"
                  : "Borders separate — click to link"
              }
              ariaLabel="Link border widths"
              Icon={magnifyLinkCtx.value ? Link2 : Link2Off}
            />
          )}
          {arrowDashCtx && (
            <ToggleIconButton
              active={arrowDashCtx.value}
              onClick={() => arrowDashCtx.onChange(!arrowDashCtx.value)}
              title="Dashed line"
              ariaLabel="Dashed line"
              Icon={DashLineIcon}
            />
          )}
        </div>
      )}
      {cornerCtx && (
        <NumericField ctx={cornerCtx} unit="px" presets={borderWidthPresets} />
      )}
      {penLevelCtx && (
        <NumericField ctx={penLevelCtx} unit="px" presets={borderWidthPresets} />
      )}
      {widthCtx && (
        <NumericField
          ctx={widthCtx}
          unit="%"
          presets={[
            { value: 0, node: <OpacityGlyph o={0} />, title: "0%" },
            { value: 40, node: <OpacityGlyph o={0.4} />, title: "40%" },
            { value: 70, node: <OpacityGlyph o={0.7} />, title: "70%" },
            { value: 100, node: <OpacityGlyph o={1} />, title: "100%" },
          ]}
        />
      )}
    </Group>
  );
}
