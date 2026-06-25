import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const elevations = [
  ["elev-1", "var(--elev-1)"],
  ["elev-2", "var(--elev-2)"],
  ["elev-3", "var(--elev-3)"],
  ["shadow-focus", "var(--shadow-focus)"],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {elevations.map(([n, v]) => (
        <div key={n} className="grid gap-3">
          <div
            className="h-28 w-full rounded-2xl"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              boxShadow: v,
            }}
          />
          <span className="text-sm" style={{ color: "var(--fg)" }}>{n}</span>
          <code className="font-mono text-xs" style={{ color: "var(--fg-3)" }}>{v}</code>
        </div>
      ))}
    </div>
  </GlassStage>
);
