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
    <div className="surface max-w-2xl overflow-hidden">
      {items.map((it, i) => (
        <div
          key={it.title}
          className="flex items-center gap-4 p-4"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
        >
          <GlowTile size={56} icon={<span style={{ fontSize: 22 }}>{it.glyph}</span>} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>{it.title}</p>
            <p className="text-xs" style={{ color: "var(--fg-3)" }}>{it.size}</p>
          </div>
          <span className="text-xs" style={{ color: "var(--success)" }}>{it.status}</span>
          <span style={{ color: "var(--fg-3)" }}>›</span>
        </div>
      ))}
    </div>
  </GlassStage>
);
