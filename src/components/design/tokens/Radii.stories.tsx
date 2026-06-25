import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const radii: Array<[string, string]> = [
  ["--radius-sm", "var(--radius-sm)"],
  ["--radius-md", "var(--radius-md)"],
  ["--radius-lg", "var(--radius-lg)"],
  ["--radius-xl", "var(--radius-xl)"],
  ["--radius-pill", "var(--radius-pill)"],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {radii.map(([n, v]) => (
        <div key={n} className="grid gap-2">
          <div
            className="h-24 w-full"
            style={{
              borderRadius: v,
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
            }}
          />
          <span className="text-xs" style={{ color: "var(--fg-2)" }}>{n}</span>
          <code className="font-mono text-xs" style={{ color: "var(--fg-3)" }}>{v}</code>
        </div>
      ))}
    </div>
  </GlassStage>
);
