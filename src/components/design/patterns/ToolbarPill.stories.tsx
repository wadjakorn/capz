import type { Story } from "@ladle/react";
import { useState } from "react";
import { GlassStage } from "../_backdrops/GlassStage";

const TOOLS = ["pen", "highlight", "rect", "arrow", "text", "blur", "crop"];

export const Default: Story = () => {
  const [active, setActive] = useState("pen");
  return (
    <GlassStage>
      <div className="flex justify-center">
        <div className="glass-pill flex items-center gap-1 px-2 py-1.5">
          {TOOLS.map((t) => {
            const on = active === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActive(t)}
                className="rounded-lg px-3 py-1.5 text-xs uppercase tracking-wide transition"
                style={
                  on
                    ? {
                        background: "rgba(255,255,255,0.18)",
                        backdropFilter: "blur(12px) saturate(160%)",
                        WebkitBackdropFilter: "blur(12px) saturate(160%)",
                        color: "#fff",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.30), 0 4px 10px rgba(0,0,0,0.18)",
                      }
                    : { color: "rgba(245,243,255,0.7)" }
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
    </GlassStage>
  );
};
