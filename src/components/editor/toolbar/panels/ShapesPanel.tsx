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
import { useT } from "@/i18n/useT";

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
  const { t } = useT();
  return (
    <Group>
      <SectionLabel>{t("editor.panel.shape")}</SectionLabel>
      {rectShapeCtx && (
        <IconSegmented<RectShapeKind>
          value={rectShapeCtx.value}
          onChange={rectShapeCtx.onChange}
          title={t("editor.panel.shape")}
          ariaLabel={t("editor.panel.shape")}
          options={[
            { value: "rect", title: t("editor.panel.rectangle"), Icon: Square },
            { value: "ellipse", title: t("editor.panel.circle"), Icon: CircleIcon },
            { value: "line", title: t("editor.panel.line"), Icon: Minus },
            { value: "dashline", title: t("editor.panel.dashedLine"), Icon: DashLineIcon },
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
