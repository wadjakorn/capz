"use client";

import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { GRADIENT_PRESETS } from "@/lib/backdrop";

/**
 * Padded-backdrop controls (K5pWujLnPFKv): an on/off toggle plus the
 * gradient/solid style, preset, padding, corner radius and shadow. On/off is
 * per-image editor state; the appearance is persisted in `general.backdrop`.
 *
 * Rendered inline inside the sidebar's global-tools panel — there is no popover
 * (CP-0044). The preset grid is `grid-cols-3`: the sidebar is `w-60` minus
 * `px-3`, ~13.5rem usable, so four columns of `h-8` swatches would overflow.
 */
export function BackdropSection() {
  const backdropOn = useEditor((s) => s.backdropOn);
  const setBackdropOn = useEditor((s) => s.setBackdropOn);
  const backdrop = useSettings((s) => s.config.general.backdrop);
  const update = useSettings((s) => s.update);

  const patch = (p: Partial<typeof backdrop>) =>
    void update("general", { backdrop: { ...backdrop, ...p } });

  const cssPreview = (colors: string[], angle: number) =>
    `linear-gradient(${angle}deg, ${colors.join(", ")})`;

  return (
    <div className="text-sm">
      <label className="mb-2 flex items-center justify-between">
        <span className="text-[var(--fg-2)]">Backdrop</span>
        <input
          type="checkbox"
          checked={backdropOn}
          onChange={(e) => setBackdropOn(e.target.checked)}
        />
      </label>

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
        <div className="mb-3 grid grid-cols-3 gap-1.5">
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
      <span className="w-14 shrink-0 text-[var(--fg-2)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[var(--accent)]"
      />
      <span className="w-7 shrink-0 text-right tabular-nums text-[var(--fg-2)]">
        {value}
      </span>
    </label>
  );
}
