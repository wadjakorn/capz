import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const gradients: Array<[string, string]> = [
  [
    "Body radial (app bg)",
    "radial-gradient(circle at 15% 10%, rgba(168,85,247,0.55) 0%, transparent 45%), radial-gradient(circle at 85% 25%, rgba(124,58,237,0.45) 0%, transparent 50%), radial-gradient(circle at 50% 100%, rgba(76,29,149,0.55) 0%, transparent 55%), linear-gradient(160deg, #3a0d6e 0%, #1a0533 60%, #0d021f 100%)",
  ],
  [
    "Primary button (violet)",
    "linear-gradient(180deg, #a78bfa 0%, #7c3aed 100%)",
  ],
  [
    "Active rail (violet alpha)",
    "linear-gradient(180deg, rgba(167,139,250,0.55) 0%, rgba(124,58,237,0.65) 100%)",
  ],
  [
    "Status emerald",
    "linear-gradient(180deg, #34d399, #10b981)",
  ],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="grid gap-4">
      {gradients.map(([name, val]) => (
        <div key={name} className="grid gap-2">
          <span className="text-sm text-white/80">{name}</span>
          <div
            className="h-32 w-full rounded-2xl border border-white/10"
            style={{ background: val }}
          />
          <code className="break-all font-mono text-[11px] text-white/40">
            {val}
          </code>
        </div>
      ))}
    </div>
  </GlassStage>
);
