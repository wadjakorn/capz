"use client";

import { useState } from "react";
import { Frame, SlidersHorizontal } from "lucide-react";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { GRADIENT_PRESETS } from "@/lib/backdrop";
import { ToolButton } from "./ToolButton";

/**
 * Editor toolbar control for the padded backdrop (K5pWujLnPFKv): a toggle plus a
 * popover to pick the gradient/solid style, preset, padding, corner radius and
 * shadow. On/off is per-image editor state; the appearance is persisted in
 * `general.backdrop`. Kept self-contained so Toolbar only imports + places it.
 */
export function BackdropControl() {
  const backdropOn = useEditor((s) => s.backdropOn);
  const setBackdropOn = useEditor((s) => s.setBackdropOn);
  const backdrop = useSettings((s) => s.config.general.backdrop);
  const update = useSettings((s) => s.update);
  const [open, setOpen] = useState(false);

  const patch = (p: Partial<typeof backdrop>) =>
    void update("general", { backdrop: { ...backdrop, ...p } });

  const cssPreview = (colors: string[], angle: number) =>
    `linear-gradient(${angle}deg, ${colors.join(", ")})`;

  return (
    <div className="relative flex items-center">
      <ToolButton
        icon={Frame}
        label="Backdrop"
        active={backdropOn}
        onClick={() => setBackdropOn(!backdropOn)}
      />
      <ToolButton
        icon={SlidersHorizontal}
        label="Backdrop options"
        pressed={open}
        onClick={() => setOpen((v) => !v)}
      />

      {open && (
        <>
          {/* Click-away catcher. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="surface absolute left-0 top-10 z-50 w-64 rounded-xl p-3 text-sm shadow-[0_18px_40px_-10px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-label="Backdrop options"
          >
            {/* Style toggle */}
            <div className="mb-2 flex items-center gap-1">
              {(["gradient", "solid"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ style: s })}
                  className={[
                    "flex-1 rounded-md px-2 py-1 text-xs capitalize transition-colors",
                    backdrop.style === s
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
                  ].join(" ")}
                >
                  {s}
                </button>
              ))}
            </div>

            {backdrop.style === "gradient" ? (
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {GRADIENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.name}
                    onClick={() => patch({ presetId: p.id })}
                    className={[
                      "h-8 rounded-md border transition-transform hover:scale-105",
                      backdrop.presetId === p.id
                        ? "border-[var(--accent)]"
                        : "border-transparent",
                    ].join(" ")}
                    style={{ backgroundImage: cssPreview(p.colors, p.angle) }}
                    aria-label={p.name}
                  />
                ))}
              </div>
            ) : (
              <label className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[var(--fg-2)]">Color</span>
                <input
                  type="color"
                  value={backdrop.solidColor}
                  onChange={(e) => patch({ solidColor: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                />
              </label>
            )}

            <SliderRow
              label="Padding"
              min={0}
              max={256}
              value={backdrop.padding}
              onChange={(v) => patch({ padding: v })}
            />
            <SliderRow
              label="Corners"
              min={0}
              max={48}
              value={backdrop.cornerRadius}
              onChange={(v) => patch({ cornerRadius: v })}
            />

            <label className="mt-1 flex items-center justify-between">
              <span className="text-[var(--fg-2)]">Shadow</span>
              <input
                type="checkbox"
                checked={backdrop.shadow}
                onChange={(e) => patch({ shadow: e.target.checked })}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 flex items-center gap-2">
      <span className="w-16 shrink-0 text-[var(--fg-2)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--accent)]"
      />
      <span className="w-8 shrink-0 text-right tabular-nums text-[var(--fg-2)]">
        {value}
      </span>
    </label>
  );
}
