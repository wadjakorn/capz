import type { Story } from "@ladle/react";
import { useState } from "react";
import { GlassStage } from "../_backdrops/GlassStage";

const labels = ["General", "Hotkeys", "Output", "Pins", "Stickers", "Debug"];

export const Horizontal: Story = () => {
  const [active, setActive] = useState(0);
  return (
    <GlassStage variant="nature">
      <div className="glass-pill inline-flex gap-1 p-1">
        {labels.slice(0, 4).map((l, i) => (
          <button
            key={l}
            type="button"
            onClick={() => setActive(i)}
            className="rounded-full px-4 py-1.5 text-sm transition"
            style={
              active === i
                ? {
                    background: "rgba(255,255,255,0.18)",
                    backdropFilter: "blur(12px) saturate(160%)",
                    WebkitBackdropFilter: "blur(12px) saturate(160%)",
                    color: "#fff",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 12px rgba(0,0,0,0.18)",
                  }
                : { color: "rgba(245,243,255,0.85)" }
            }
          >
            {l}
          </button>
        ))}
      </div>
    </GlassStage>
  );
};

export const VerticalRail: Story = () => {
  const [active, setActive] = useState(0);
  return (
    <GlassStage variant="nature">
      <div className="flex gap-6">
        <div
          className="glass-pill flex flex-col gap-2 p-2"
          style={{ borderRadius: "1.25rem" }}
        >
          {labels.map((l, i) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(i)}
              data-active={active === i ? "" : undefined}
              className="rail-button"
              aria-label={l}
              title={l}
            >
              {l[0]}
            </button>
          ))}
        </div>
        <div className="glass-card flex-1 p-6">
          <h3 className="headline-xl">{labels[active]}</h3>
          <p className="mt-2 text-sm text-white/80">
            Active rail item shows violet glow + green ✓ badge.
          </p>
        </div>
      </div>
    </GlassStage>
  );
};
