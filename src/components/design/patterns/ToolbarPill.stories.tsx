import type { Story } from "@ladle/react";
import { useState } from "react";
import { GlassStage } from "../_backdrops/GlassStage";

const TOOLS = ["pen", "highlight", "rect", "arrow", "text", "blur", "crop"];

function Toolbar() {
  const [active, setActive] = useState("pen");
  return (
    <div className="toolbar flex items-center gap-1 px-2 py-1.5">
      {TOOLS.map((t) => {
        const on = active === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => setActive(t)}
            className="btn-icon text-xs uppercase tracking-wide"
            data-active={on ? "true" : undefined}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

export const Default: Story = () => (
  <GlassStage>
    <div className="flex justify-center">
      <Toolbar />
    </div>
  </GlassStage>
);

export const Soft: Story = () => (
  <GlassStage>
    <div className="flex justify-center">
      <Toolbar />
    </div>
  </GlassStage>
);
