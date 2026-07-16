"use client";

import { SectionLabel } from "../PresetSlider";
import { BlurGlyph } from "./glyphs";
import { Group, NumericField } from "./kit";
import type { NumCtx } from "./types";

/** Blur tool: a single "Blur" radius control (range 2–60). */
export function BlurPanel({ widthCtx }: { widthCtx: NumCtx | null }) {
  if (!widthCtx) return null;
  return (
    <Group>
      <SectionLabel>Blur</SectionLabel>
      <NumericField
        ctx={widthCtx}
        presets={[
          { value: 8, node: <BlurGlyph b={1} />, title: "8 px" },
          { value: 16, node: <BlurGlyph b={2} />, title: "16 px" },
          { value: 32, node: <BlurGlyph b={3.5} />, title: "32 px" },
          { value: 60, node: <BlurGlyph b={5} />, title: "60 px" },
        ]}
      />
    </Group>
  );
}
