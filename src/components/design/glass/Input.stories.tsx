import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
    <div className="grid max-w-md gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm text-white">Text</span>
        <input className="glass-input" placeholder="Type here…" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm text-white">Number</span>
        <input className="glass-input" type="number" defaultValue={42} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm text-white">Search</span>
        <input
          className="glass-input"
          type="search"
          placeholder="Search settings…"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm text-white">Textarea</span>
        <textarea
          className="glass-input"
          rows={4}
          placeholder="Multi-line input"
        />
      </label>
    </div>
  </GlassStage>
);
