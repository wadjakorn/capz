"use client";

import { SectionLabel } from "../PresetSlider";
import { OpacityGlyph, StrokeGlyph } from "./glyphs";
import { ColorField, Group, NumericField } from "./kit";
import type { ColorCtx, NumCtx } from "./types";
import type { RefObject } from "react";

/** Highlighter tool: color, width (4–100), and opacity (10–100%). */
export function HighlighterPanel({
  colorCtx,
  widthCtx,
  sizeCtx,
  colorInputRef,
  selected,
}: {
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  sizeCtx: NumCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
}) {
  return (
    <Group>
      <SectionLabel>Highlighter</SectionLabel>
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
            { value: 8, node: <StrokeGlyph t={1.5} />, title: "8 px" },
            { value: 20, node: <StrokeGlyph t={3} />, title: "20 px" },
            { value: 48, node: <StrokeGlyph t={5} />, title: "48 px" },
            { value: 90, node: <StrokeGlyph t={7} />, title: "90 px" },
          ]}
        />
      )}
      {sizeCtx && (
        <NumericField
          ctx={sizeCtx}
          unit="%"
          presets={[
            { value: 25, node: <OpacityGlyph o={0.25} />, title: "25%" },
            { value: 50, node: <OpacityGlyph o={0.5} />, title: "50%" },
            { value: 75, node: <OpacityGlyph o={0.75} />, title: "75%" },
            { value: 100, node: <OpacityGlyph o={1} />, title: "100%" },
          ]}
        />
      )}
    </Group>
  );
}
