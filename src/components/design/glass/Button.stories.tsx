import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
    <div className="grid gap-6">
      <Row label="Transparent">
        <button type="button" className="glass-button">Ghost</button>
        <button type="button" className="glass-pill px-4 py-2 text-sm text-white">
          Pill
        </button>
        <button type="button" className="glass-button" aria-label="favorite">
          ★
        </button>
      </Row>
      <Row label="Tinted">
        <button type="button" className="glass-button-primary">Primary</button>
      </Row>
      <Row label="Disabled">
        <button type="button" className="glass-button" disabled>
          Ghost
        </button>
        <button type="button" className="glass-button-primary" disabled>
          Primary
        </button>
      </Row>
    </div>
  </GlassStage>
);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="eyebrow">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
