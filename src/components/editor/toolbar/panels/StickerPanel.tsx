"use client";

import { SectionLabel } from "../PresetSlider";
import { STICKERS, type StickerSelection } from "@/stores/editor";
import type { StickerEntry } from "@/stores/stickers";
import { ShapeSizeGlyph } from "./glyphs";
import { Group, NumericField } from "./kit";
import type { NumCtx } from "./types";

/** Sticker tool: emoji/image picker + a "Size" control (range 12–200). */
export function StickerPanel({
  sizeCtx,
  entries,
  selection,
  onSelect,
  showPicker,
}: {
  sizeCtx: NumCtx | null;
  entries: StickerEntry[];
  selection: StickerSelection;
  onSelect: (sel: StickerSelection) => void;
  /** The emoji/image grid shows only in tool mode; a selected sticker gets
   * just the Size control. */
  showPicker: boolean;
}) {
  return (
    <Group>
      {showPicker && (
        <>
      <SectionLabel>Sticker</SectionLabel>
      <div className="flex flex-wrap items-center gap-0.5">
        {entries.length > 0
          ? entries.map((e) => {
              const active =
                selection.kind === "image" && selection.src === e.dataUrl;
              return (
                <button
                  key={e.name}
                  type="button"
                  onClick={() =>
                    onSelect({ kind: "image", src: e.dataUrl, name: e.name })
                  }
                  title={e.name}
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded p-0.5 transition-colors",
                    active ? "bg-[var(--accent)]" : "hover:bg-[var(--surface-raised)]",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.dataUrl}
                    alt={e.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              );
            })
          : STICKERS.map((c) => {
              const active = selection.kind === "emoji" && selection.char === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onSelect({ kind: "emoji", char: c })}
                  title={c}
                  className={[
                    "rounded px-1.5 py-0.5 text-base leading-none transition-colors",
                    active
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "hover:bg-[var(--surface-raised)]",
                  ].join(" ")}
                >
                  {c}
                </button>
              );
            })}
      </div>
        </>
      )}
      {sizeCtx && (
        <>
          <SectionLabel>Size</SectionLabel>
          <NumericField
            ctx={sizeCtx}
            unit="px"
            presets={[
              { value: 32, node: <ShapeSizeGlyph s={9} />, title: "32 px" },
              { value: 64, node: <ShapeSizeGlyph s={12} />, title: "64 px" },
              { value: 120, node: <ShapeSizeGlyph s={16} />, title: "120 px" },
              { value: 200, node: <ShapeSizeGlyph s={20} />, title: "200 px" },
            ]}
          />
        </>
      )}
    </Group>
  );
}
