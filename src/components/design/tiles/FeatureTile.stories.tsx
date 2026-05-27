import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";
import { GlowTile } from "./GlowTile";

const features: Array<{ label: string; count: string; glyph: string }> = [
  { label: "System Junk", count: "4.8 GB", glyph: "⚙" },
  { label: "Large Files", count: "1.2 GB", glyph: "▣" },
  { label: "Malware", count: "0", glyph: "⌖" },
  { label: "Updater", count: "3", glyph: "↑" },
  { label: "Privacy", count: "12", glyph: "◐" },
  { label: "Speed", count: "—", glyph: "≣" },
];

export const Grid: Story = () => (
  <GlassStage>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <div key={f.label} className="glass-card flex items-center gap-4 p-4">
          <GlowTile
            size={56}
            icon={<span style={{ fontSize: "0.5em" }}>{f.glyph}</span>}
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{f.label}</p>
            <p className="text-xs text-white/70">{f.count}</p>
          </div>
          <span className="text-white/50">›</span>
        </div>
      ))}
    </div>
  </GlassStage>
);
