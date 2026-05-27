import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const depths = [
  ["depth-1", "var(--depth-1)"],
  ["depth-2", "var(--depth-2)"],
  ["depth-3", "var(--depth-3)"],
  ["depth-4", "var(--depth-4)"],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {depths.map(([n, v]) => (
        <div key={n} className="grid gap-3">
          <div
            className="h-28 w-full rounded-2xl border border-white/10 bg-white/[0.06]"
            style={{ boxShadow: v }}
          />
          <span className="text-sm text-white">{n}</span>
        </div>
      ))}
    </div>
  </GlassStage>
);
