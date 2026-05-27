import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
    <div className="flex items-center justify-center py-10">
      <button type="button" className="glass-button-primary">
        <span>⚡</span>
        <span>Run Smart Care</span>
      </button>
    </div>
  </GlassStage>
);
