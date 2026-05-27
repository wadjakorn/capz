import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const surfaces: Array<[string, string]> = [
  ["--background", "#1a0533"],
  ["--popover", "#2a0a52"],
  ["--card", "rgba(255,255,255,0.06)"],
  ["--foreground", "#f5f3ff"],
  ["--muted-foreground", "rgba(245,243,255,0.62)"],
  ["--primary", "#a78bfa"],
];

const charts: Array<[string, string]> = [
  ["chart-1 violet", "#a78bfa"],
  ["chart-2 emerald", "#34d399"],
  ["chart-3 amber", "#fbbf24"],
  ["chart-4 rose", "#f472b6"],
  ["chart-5 sky", "#38bdf8"],
];

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="glass-card flex items-center gap-3 p-3">
      <div
        className="h-10 w-10 rounded-md border border-white/10"
        style={{ background: value }}
      />
      <div className="grid">
        <span className="text-sm font-medium text-white">{name}</span>
        <span className="font-mono text-xs text-white/60">{value}</span>
      </div>
    </div>
  );
}

export const Default: Story = () => (
  <GlassStage>
  <div className="grid gap-8">
    <section>
      <h2 className="headline-xl mb-4">Surfaces & text</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {surfaces.map(([n, v]) => (
          <Swatch key={n} name={n} value={v} />
        ))}
      </div>
    </section>
    <section>
      <h2 className="headline-xl mb-4">Chart palette</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {charts.map(([n, v]) => (
          <Swatch key={n} name={n} value={v} />
        ))}
      </div>
    </section>
  </div>
  </GlassStage>
);
