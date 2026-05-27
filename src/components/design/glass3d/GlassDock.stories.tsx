import type { Story } from "@ladle/react";
import { GlassDock } from "./GlassDock";
import { GlowTile } from "../tiles/GlowTile";
import { GlassStage } from "../_backdrops/GlassStage";

const LABELS = ["V", "E", "A", "R", "S", "C"];

export const Default: Story = () => (
  <GlassStage>
    <div className="flex flex-col items-center gap-8">
      <GlassDock>
        {LABELS.map((l) => (
          <GlowTile key={l} size={40} icon={<span style={{ fontSize: 18 }}>{l}</span>} />
        ))}
      </GlassDock>
      <p className="text-xs text-white/40">Bottom dock — hover the tiles for hover lift (CSS).</p>
    </div>
  </GlassStage>
);
