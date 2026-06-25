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
        <div key={f.label} className="surface flex items-center gap-4 p-4">
          <GlowTile
            size={56}
            icon={<span style={{ fontSize: "0.5em" }}>{f.glyph}</span>}
          />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>{f.label}</p>
            <p className="text-xs" style={{ color: "var(--fg-2)" }}>{f.count}</p>
          </div>
          <span style={{ color: "var(--fg-3)" }}>›</span>
        </div>
      ))}
    </div>
  </GlassStage>
);
