import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const palette: Array<[string, string]> = [
  ["--bg", "#0f0f12"],
  ["--bg-canvas", "#0d0d10"],
  ["--surface", "#161619"],
  ["--surface-raised", "#1f1f24"],
  ["--surface-overlay", "#1c1c21"],
  ["--border", "rgba(255,255,255,0.08)"],
  ["--fg", "#ecedf0"],
  ["--fg-2", "#c9cad1"],
  ["--fg-3", "#9a9aa3"],
  ["--accent", "#6d7cff"],
  ["--accent-soft", "rgba(109,124,255,0.16)"],
  ["--success", "#34d399"],
  ["--warning", "#fbbf24"],
  ["--danger", "#f76b6b"],
];

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="surface flex items-center gap-3 p-3">
      <div
        className="h-10 w-10 flex-shrink-0 rounded-md"
        style={{ background: value, border: "1px solid var(--border)" }}
      />
      <div className="grid min-w-0">
        <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>{name}</span>
        <span className="font-mono text-xs" style={{ color: "var(--fg-3)" }}>{value}</span>
      </div>
    </div>
  );
}

export const Default: Story = () => (
  <GlassStage>
    <div className="grid gap-8 w-full">
      <section>
        <h2 className="headline mb-4" style={{ color: "var(--fg)" }}>Graphite palette</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {palette.map(([n, v]) => (
            <Swatch key={n} name={n} value={v} />
          ))}
        </div>
      </section>
    </div>
  </GlassStage>
);
