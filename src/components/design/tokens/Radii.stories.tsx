import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const radii: Array<[string, string]> = [
  ["sm (calc * .6)", "calc(0.75rem * 0.6)"],
  ["md (calc * .8)", "calc(0.75rem * 0.8)"],
  ["lg base", "0.75rem"],
  ["xl", "calc(0.75rem * 1.4)"],
  ["2xl", "calc(0.75rem * 1.8)"],
  ["3xl", "calc(0.75rem * 2.2)"],
  ["pill", "9999px"],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {radii.map(([n, v]) => (
        <div key={n} className="grid gap-2">
          <div
            className="h-24 w-full border border-white/10 bg-white/[0.06]"
            style={{ borderRadius: v }}
          />
          <span className="text-xs text-white/70">{n}</span>
          <code className="font-mono text-[11px] text-white/40">{v}</code>
        </div>
      ))}
    </div>
  </GlassStage>
);
