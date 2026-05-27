import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";
import { GlowTile } from "./GlowTile";

const SIZES = [40, 56, 72, 96] as const;

const Glyph = ({ ch }: { ch: string }) => (
  <span style={{ fontSize: "0.5em", fontWeight: 700 }}>{ch}</span>
);

export const Sizes: Story = () => (
  <GlassStage>
    <div className="grid gap-8">
      {SIZES.map((s) => (
        <div key={s} className="grid gap-3">
          <span className="eyebrow">SIZE {s}</span>
          <div className="flex flex-wrap items-center gap-4">
            <GlowTile size={s} icon={<Glyph ch="◆" />} />
          </div>
        </div>
      ))}
    </div>
  </GlassStage>
);

export const WithCheckmark: Story = () => (
  <GlassStage>
    <div className="flex flex-wrap gap-4">
      <GlowTile size={72} icon={<Glyph ch="✓" />} checkmark />
    </div>
  </GlassStage>
);
