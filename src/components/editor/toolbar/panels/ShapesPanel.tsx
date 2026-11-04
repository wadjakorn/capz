"use client";

import { Circle as CircleIcon, Focus, Minus, Square } from "lucide-react";
import { SectionLabel } from "../PresetSlider";
import { RadiusGlyph, StrokeGlyph } from "./glyphs";
import {
  ColorField,
  DashLineIcon,
  DimLightIcon,
  DimMediumIcon,
  DimStrongIcon,
  DotLineIcon,
  Group,
  IconSegmented,
  NumericField,
  SolidLineIcon,
  ToggleIconButton,
} from "./kit";
import type { ColorCtx, DimCtx, NumCtx, RectShapeCtx, StrokeStyleCtx } from "./types";
import type { DimLevel, RectShapeKind, StrokeStyle } from "@/stores/editor";
import type { RefObject } from "react";
import { useT } from "@/i18n/useT";

/** Shapes tool (rect/ellipse/line): a shape picker (hidden while a shape is
 * selected), a solid/dashed/dotted line style, stroke color + width (1–20), and
 * a corner radius (0–60) for the rectangle, and — for rect / ellipse — a
 * spotlight dim with three levels (CP-0095). */
export function ShapesPanel({
  colorCtx,
  widthCtx,
  cornerCtx,
  rectShapeCtx,
  strokeStyleCtx,
  dimCtx,
  colorInputRef,
  selected,
}: {
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  cornerCtx: NumCtx | null;
  rectShapeCtx: RectShapeCtx | null;
  strokeStyleCtx: StrokeStyleCtx | null;
  dimCtx: DimCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
}) {
  const { t } = useT();
  return (
    <Group>
      {rectShapeCtx && <SectionLabel>{t("editor.panel.shape")}</SectionLabel>}
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
          ]}
        />
      )}
      {strokeStyleCtx && <SectionLabel>{t("editor.panel.strokeStyle")}</SectionLabel>}
      {strokeStyleCtx && (
        <IconSegmented<StrokeStyle>
          value={strokeStyleCtx.value}
          onChange={strokeStyleCtx.onChange}
          title={t("editor.panel.strokeStyle")}
          ariaLabel={t("editor.panel.strokeStyle")}
          options={[
            { value: "solid", title: t("editor.panel.solid"), Icon: SolidLineIcon },
            { value: "dashed", title: t("editor.panel.dashed"), Icon: DashLineIcon },
            { value: "dotted", title: t("editor.panel.dotted"), Icon: DotLineIcon },
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
      {dimCtx && <SectionLabel>{t("editor.panel.dimAround")}</SectionLabel>}
      {dimCtx && (
        <div className="flex items-center gap-0.5">
          <ToggleIconButton
            active={dimCtx.on}
            onClick={() => dimCtx.setOn(!dimCtx.on)}
            title={t("editor.panel.dimAroundToggle")}
            ariaLabel={t("editor.panel.dimAroundToggle")}
            Icon={Focus}
          />
          {dimCtx.on && (
            <>
              <span className="mx-1 h-5 w-px bg-[var(--border-strong)]" aria-hidden />
              <IconSegmented<DimLevel>
                value={dimCtx.level}
                onChange={dimCtx.setLevel}
                title={t("editor.panel.dimAround")}
                ariaLabel={t("editor.panel.dimAround")}
                options={[
                  { value: "light", title: t("editor.panel.dimLight"), Icon: DimLightIcon },
                  { value: "medium", title: t("editor.panel.dimMedium"), Icon: DimMediumIcon },
                  { value: "strong", title: t("editor.panel.dimStrong"), Icon: DimStrongIcon },
                ]}
              />
            </>
          )}
        </div>
      )}
    </Group>
  );
}
