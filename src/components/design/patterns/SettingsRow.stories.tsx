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

const rows = [
  ["Launch at login", "Open Shotr automatically after macOS login", true],
  ["Play capture sound", "Camera shutter when capture starts", false],
  ["Show in menu bar", "Tray icon for quick access", true],
  ["Auto-update", "Install updates in the background", true],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="glass-card max-w-xl overflow-hidden">
      {rows.map(([title, sub, init], i) => (
        <div
          key={String(title)}
          className="flex items-center justify-between gap-4 p-4"
          style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="grid">
            <span className="text-sm font-medium text-white">{title}</span>
            <span className="text-xs text-white/60">{sub}</span>
          </div>
          <Toggle initial={init as boolean} />
        </div>
      ))}
    </div>
  </GlassStage>
);
