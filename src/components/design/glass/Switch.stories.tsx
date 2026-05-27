import type { Story } from "@ladle/react";
import { useState } from "react";
import { GlassStage } from "../_backdrops/GlassStage";

function Toggle({ initial = false }: { initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className="relative h-6 w-11 rounded-full border border-white/10 transition"
      style={{
        background: on ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.10)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <span
        className="absolute top-[2px] h-5 w-5 rounded-full bg-white transition-all"
        style={{ left: on ? 22 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
      />
    </button>
  );
}

export const Default: Story = () => (
  <GlassStage>
    <div className="grid max-w-md gap-3">
      {[
        ["Launch at login", true],
        ["Play capture sound", false],
        ["Show in menu bar", true],
        ["Auto-update", true],
      ].map(([label, init]) => (
        <div
          key={String(label)}
          className="glass-card flex items-center justify-between p-4"
        >
          <span className="text-sm text-white">{label}</span>
          <Toggle initial={init as boolean} />
        </div>
      ))}
    </div>
  </GlassStage>
);
