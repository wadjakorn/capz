import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="glass-card p-6">
        <h3 className="mb-2 text-lg font-semibold text-white">.glass-card</h3>
        <p className="text-sm text-white/70">
          Liquid glass. 1.5rem radius, 30px blur + 180% saturate, rim border, top sheen.
        </p>
      </div>

      <div className="glass-pill inline-flex items-center gap-3 self-start px-5 py-3">
        <span className="text-sm text-white">.glass-pill toolbar</span>
      </div>

      <div
        className="rounded-2xl border border-white/10 p-6"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <h3 className="mb-2 text-lg font-semibold text-white">Sidebar panel</h3>
        <p className="text-sm text-white/70">Lower-alpha translucent rail (no liquid treatment).</p>
      </div>

      <div className="glass-card flex items-center justify-between p-5">
        <div>
          <span className="eyebrow">JUNK</span>
          <p className="mt-1 text-3xl font-semibold text-white">4.8 GB</p>
        </div>
        <span className="text-sm text-emerald-400">Cleaned ✓</span>
      </div>
    </div>
  </GlassStage>
);
