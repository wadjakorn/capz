import type { Story } from "@ladle/react";
import { DeepGlassCard } from "./DeepGlassCard";
import { GlowTile } from "../tiles/GlowTile";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
  <div className="grid gap-6 md:grid-cols-2">
    <DeepGlassCard className="p-8">
      <span className="eyebrow">SMART CARE</span>
      <h2 className="headline-xl mt-2">Cleaned 4.8 GB</h2>
      <p className="mt-2 text-sm text-white/70">
        Your Mac is fresh. Run a deeper scan to free another 1.6 GB.
      </p>
      <div className="mt-6 flex gap-3">
        <button className="glass-button-primary">Run Scan</button>
        <button className="glass-button">Details</button>
      </div>
    </DeepGlassCard>

    <DeepGlassCard className="p-6">
      <div className="flex items-center gap-4">
        <GlowTile size={72} icon={<span style={{ fontSize: 28 }}>✓</span>} />
        <div>
          <p className="text-sm text-white/70">Status</p>
          <p className="text-xl font-semibold text-white">All clean</p>
        </div>
      </div>
    </DeepGlassCard>
  </div>
  </GlassStage>
);
