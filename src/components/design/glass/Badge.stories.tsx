import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        background: "rgba(255,255,255,0.08)",
        borderColor: "rgba(255,255,255,0.18)",
        color,
      }}
    >
      {children}
    </span>
  );
}

export const Default: Story = () => (
  <GlassStage>
    <div className="flex flex-wrap items-center gap-3">
      <Badge color="#a78bfa">violet</Badge>
      <Badge color="#34d399">emerald</Badge>
      <Badge color="#fbbf24">amber</Badge>
      <Badge color="#f472b6">rose</Badge>
      <Badge color="#38bdf8">sky</Badge>
      <Badge color="#22d3ee">cyan</Badge>
      <Badge color="#e879f9">fuchsia</Badge>
    </div>
  </GlassStage>
);
