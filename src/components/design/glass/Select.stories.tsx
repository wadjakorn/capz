import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
    <div className="grid max-w-md gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm text-white">Default</span>
        <select className="glass-select">
          <option>Clipboard</option>
          <option>File</option>
          <option>Both</option>
        </select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm text-white">Disabled</span>
        <select className="glass-select" disabled>
          <option>Disabled</option>
        </select>
      </label>
    </div>
  </GlassStage>
);
