"use client";

import { Circle as CircleIcon, Minus, Square } from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { RadiusGlyph, StrokeGlyph } from "./glyphs";
import {
  ColorField,
  DashLineIcon,
  Group,
  IconSegmented,
  NumericField,
} from "./kit";
import type { ColorCtx, NumCtx, RectShapeCtx } from "./types";
import type { RectShapeKind } from "@/stores/editor";
import type { RefObject } from "react";

/** Shapes tool (rect/ellipse/line/dashed): stroke color + width (1–20), a shape
 * picker, and a corner radius (0–60) for the rectangle. */
export function ShapesPanel({
  colorCtx,
  widthCtx,
  cornerCtx,
  rectShapeCtx,
  colorInputRef,
  selected,
}: {
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  cornerCtx: NumCtx | null;
  rectShapeCtx: RectShapeCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
}) {
  return (
    <Group>
      <SectionLabel>Shape</SectionLabel>
      {rectShapeCtx && (
        <IconSegmented<RectShapeKind>
          value={rectShapeCtx.value}
          onChange={rectShapeCtx.onChange}
          title="Shape"
          ariaLabel="Shape"
          options={[
            { value: "rect", title: "Rectangle", Icon: Square },
            { value: "ellipse", title: "Circle", Icon: CircleIcon },
            { value: "line", title: "Line", Icon: Minus },
            { value: "dashline", title: "Dashed line", Icon: DashLineIcon },
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
            { value: 4, node: <StrokeGlyph t={2} />, title: "4 px" },
            { value: 8, node: <StrokeGlyph t={3.5} />, title: "8 px" },
            { value: 14, node: <StrokeGlyph t={5} />, title: "14 px" },
          ]}
        />
      )}
      {cornerCtx && (
        <NumericField
          ctx={cornerCtx}
          unit="px"
          presets={[
            { value: 0, node: <RadiusGlyph r={0} />, title: "0 px" },
            { value: 8, node: <RadiusGlyph r={2} />, title: "8 px" },
            { value: 24, node: <RadiusGlyph r={4.5} />, title: "24 px" },
            { value: 60, node: <RadiusGlyph r={5.5} />, title: "60 px" },
          ]}
        />
      )}
    </Group>
  );
}
