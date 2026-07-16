"use client";

import { ArrowLeftRight } from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { StrokeGlyph } from "./glyphs";
import { ColorField, DashLineIcon, Group, NumericField, ToggleIconButton } from "./kit";
import type { ColorCtx, ArrowHeadsCtx, NumCtx, ToggleCtx } from "./types";
import type { RefObject } from "react";

/** Arrow tool: stroke color + width (1–20), plus two-way/dash toggles. Also
 * serves a headless "line" (Shapes) where only color/width/dash are set. */
export function ArrowPanel({
  colorCtx,
  widthCtx,
  arrowHeadsCtx,
  arrowDashCtx,
  colorInputRef,
  selected,
}: {
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  arrowHeadsCtx: ArrowHeadsCtx | null;
  arrowDashCtx: ToggleCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
}) {
  const twoWay = arrowHeadsCtx?.value === "both";
  return (
    <Group>
      <SectionLabel>Line</SectionLabel>
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
            { value: 4, node: <StrokeGlyph t={2} />, title: "4 px" },
            { value: 8, node: <StrokeGlyph t={3.5} />, title: "8 px" },
            { value: 14, node: <StrokeGlyph t={5} />, title: "14 px" },
          ]}
        />
      )}
      {(arrowHeadsCtx || arrowDashCtx) && (
        <div className="flex items-center gap-0.5">
          {arrowHeadsCtx && (
            <ToggleIconButton
              active={twoWay}
              onClick={() => arrowHeadsCtx.onChange(twoWay ? "end" : "both")}
              title="Two-way arrowhead"
              Icon={ArrowLeftRight}
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
    </Group>
  );
}
