"use client";

import { useEffect, useState } from "react";
import { Frame, SunMedium } from "lucide-react";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import {
  BACKDROP_PRESETS,
  resolvePreset,
  type BackdropCategory,
  type BackdropPreset,
  type PatternPreset,
} from "@/lib/backdrop";
import { paintSwatch } from "@/lib/backdropPatterns";
import { ActionRow } from "./panels/kit";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";

/** Picker tabs: three preset families plus the flat colour. */
type Tab = BackdropCategory | "solid";
const TABS: Array<{ id: Tab; labelKey: TKey }> = [
  { id: "gradient", labelKey: "editor.backdrop.tab.gradient" },
  { id: "minimal", labelKey: "editor.backdrop.tab.minimal" },
  { id: "art", labelKey: "editor.backdrop.tab.art" },
  { id: "solid", labelKey: "editor.backdrop.tab.solid" },
];

/**
 * Padded-backdrop controls (K5pWujLnPFKv): an on/off toggle plus the
 * gradient/solid style, preset, padding, corner radius and shadow. On/off is
 * per-image editor state; the appearance is persisted in `general.backdrop`.
 *
 * Rendered inline inside the sidebar's Canvas panel — there is no popover
 * (CP-0044).
 *
 * One segmented row picks the family (Gradient / Minimal / Art) or Solid, and
 * the grid shows only that family. Expanded, this section is by far the tallest
 * thing in the panel and a third grid row pushed it past the sidebar's height
 * at the default window size, so the grid is `grid-cols-6` of square chips:
 * the largest family (12 art presets) still fits in two rows. The tab is UI
 * state only — what is persisted is `style` + `presetId`.
 */
export function BackdropSection() {
  const { t: tr } = useT();
  const backdropOn = useEditor((s) => s.backdropOn);
  const setBackdropOn = useEditor((s) => s.setBackdropOn);
  const backdrop = useSettings((s) => s.config.general.backdrop);
  const update = useSettings((s) => s.update);

  const patch = (p: Partial<typeof backdrop>) =>
    void update("general", { backdrop: { ...backdrop, ...p } });

  const current = resolvePreset(backdrop.presetId);
  const activeTab: Tab = backdrop.style === "solid" ? "solid" : current.category;
  // The family being browsed; defaults to the selected preset's family.
  const [browse, setBrowse] = useState<Tab>(activeTab);
  const tab = backdrop.style === "solid" ? "solid" : browse === "solid" ? activeTab : browse;

  const pickTab = (t: Tab) => {
    setBrowse(t);
    if (t === "solid") patch({ style: "solid" });
    else if (backdrop.style !== "gradient") patch({ style: "gradient" });
  };

  return (
    <div className="text-sm">
      <div className="mb-1">
        <ActionRow
          Icon={Frame}
          label={tr("editor.backdrop.show")}
          pressed={backdropOn}
          onClick={() => setBackdropOn(!backdropOn)}
        />
      </div>

      {/* The appearance controls are meaningless with the backdrop off, so they
          stay hidden until it's enabled. */}
      {!backdropOn ? null : (
        <>
          <div className="px-2">
          {/* Family / solid toggle */}
          <div className="mb-2 flex items-center gap-0.5" role="tablist" aria-label={tr("editor.backdrop.style")}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => pickTab(t.id)}
                title={tr(t.labelKey)}
                className={[
                  "min-w-0 flex-1 truncate whitespace-nowrap rounded-md px-1 py-1 text-xs transition-colors",
                  tab === t.id
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
                ].join(" ")}
              >
                {tr(t.labelKey)}
              </button>
            ))}
          </div>

          {tab !== "solid" ? (
            <div className="mb-2 grid grid-cols-6 gap-1.5">
              {BACKDROP_PRESETS.filter((p) => p.category === tab).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.name}
                  onClick={() => patch({ style: "gradient", presetId: p.id })}
                  className={[
                    "aspect-square overflow-hidden rounded-md border transition-transform hover:scale-105",
                    backdrop.style === "gradient" && current.id === p.id
                      ? "border-[var(--accent)]"
                      : "border-transparent",
                  ].join(" ")}
                  aria-label={p.name}
                  aria-pressed={backdrop.style === "gradient" && current.id === p.id}
                >
                  <Swatch preset={p} />
                </button>
              ))}
            </div>
          ) : (
            <label className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[var(--fg-2)]">{tr("editor.backdrop.color")}</span>
              <input
                type="color"
                value={backdrop.solidColor}
                onChange={(e) => patch({ solidColor: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent"
              />
            </label>
          )}

          <SliderRow
            label={tr("editor.backdrop.padding")}
            min={0}
            max={256}
            value={backdrop.padding}
            onChange={(v) => patch({ padding: v })}
          />
          <SliderRow
            label={tr("editor.backdrop.corners")}
            min={0}
            max={48}
            value={backdrop.cornerRadius}
            onChange={(v) => patch({ cornerRadius: v })}
          />
          </div>

          <div className="mt-1">
            <ActionRow
              Icon={SunMedium}
              label={tr("editor.backdrop.shadow")}
              pressed={backdrop.shadow}
              onClick={() => patch({ shadow: !backdrop.shadow })}
            />
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
      <span className="w-14 shrink-0 truncate text-[var(--fg-2)]" title={label}>
        {label}
      </span>
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

function Swatch({ preset }: { preset: BackdropPreset }) {
  if (preset.kind === "linear") {
    return (
      <span
        className="block h-full w-full"
        style={{
          backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.colors.join(", ")})`,
        }}
      />
    );
  }
  return <PatternSwatch preset={preset} />;
}

/** Pattern swatches are painted once per preset and reused across mounts. */
const swatchCache = new Map<string, string>();
const SWATCH_PX = 64;

function patternSwatchUrl(preset: PatternPreset): string {
  const hit = swatchCache.get(preset.id);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = SWATCH_PX;
  c.height = SWATCH_PX;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  // Tiles at half scale so a few repeats show; compositions are fitted as if
  // the chip were a ~900px backdrop so their shapes stay recognisable.
  const unit = preset.pattern.mode === "tile" ? 0.5 : SWATCH_PX / 900;
  paintSwatch(preset.pattern, ctx, SWATCH_PX, SWATCH_PX, unit);
  const url = c.toDataURL("image/png");
  swatchCache.set(preset.id, url);
  return url;
}

function PatternSwatch({ preset }: { preset: PatternPreset }) {
  // Painted after mount: the static export prerenders without a DOM canvas.
  const [url, setUrl] = useState(() => swatchCache.get(preset.id) ?? "");
  useEffect(() => {
    setUrl(patternSwatchUrl(preset));
  }, [preset]);
  return (
    <span
      className="block h-full w-full bg-cover"
      style={{ backgroundColor: preset.base, backgroundImage: url ? `url(${url})` : undefined }}
    />
  );
}
