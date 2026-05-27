import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";
import { GlowTile } from "../tiles/GlowTile";

const items: Array<{ title: string; size: string; status?: string; glyph: string }> = [
  { title: "System Junk", size: "4.8 GB", status: "Cleaned", glyph: "⚙" },
  { title: "Mail Attachments", size: "612 MB", status: "Ready", glyph: "✉" },
  { title: "Trash Bins", size: "1.1 GB", status: "Ready", glyph: "♺" },
  { title: "Photo Cache", size: "240 MB", status: "Ready", glyph: "▣" },
  { title: "iTunes Junk", size: "82 MB", status: "Ready", glyph: "♪" },
];

export const Default: Story = () => (
  <GlassStage>
    <div className="glass-card max-w-2xl overflow-hidden">
      {items.map((it, i) => (
        <div
          key={it.title}
          className="flex items-center gap-4 p-4"
          style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
        >
          <GlowTile size={56} icon={<span style={{ fontSize: 22 }}>{it.glyph}</span>} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{it.title}</p>
            <p className="text-xs text-white/60">{it.size}</p>
          </div>
          <span className="text-xs text-emerald-400">{it.status}</span>
          <span className="text-white/40">›</span>
        </div>
      ))}
    </div>
  </GlassStage>
);
