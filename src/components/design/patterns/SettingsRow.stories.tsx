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
      className="switch"
    >
      <span className="switch-thumb" />
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
    <div className="surface max-w-xl overflow-hidden">
      {rows.map(([title, sub, init], i) => (
        <div
          key={String(title)}
          className="flex items-center justify-between gap-4 p-4"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
        >
          <div className="grid">
            <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>{title}</span>
            <span className="text-xs" style={{ color: "var(--fg-3)" }}>{sub}</span>
          </div>
          <Toggle initial={init as boolean} />
        </div>
      ))}
    </div>
  </GlassStage>
);
