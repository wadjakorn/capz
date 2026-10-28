"use client";

import { SectionLabel } from "../PresetSlider";
import type { StickerSelection } from "@/stores/editor";
import { useStickers } from "@/stores/stickers";
import { stickerSelectionFor, useStickerSets } from "@/hooks/useStickerSets";
import type { StickerSet } from "@/lib/stickers/builtin";
import { ShapeSizeGlyph } from "./glyphs";
import { Group, NumericField } from "./kit";
import type { NumCtx } from "./types";
import { useT } from "@/i18n/useT";

/** One tab per enabled sticker set (CP-0048), then that set's grid. */
function StickerPicker({
  selection,
  onSelect,
}: {
  selection: StickerSelection;
  onSelect: (sel: StickerSelection) => void;
}) {
  const { t } = useT();
  const sets = useStickerSets();
  const activeSetId = useStickers((s) => s.activeSetId);
  const setActiveSetId = useStickers((s) => s.setActiveSetId);
  const folderState = useStickers((s) => s.folders);
  const active = sets.find((s) => s.id === activeSetId) ?? sets[0];
  const setLabel = (s: StickerSet) => (s.nameKey ? t(s.nameKey) : (s.name ?? s.id));
  const folder = active.source === "dir" ? folderState[active.id] : undefined;

  return (
    <div className="grid gap-1.5">
      {sets.length > 1 && (
        <div className="flex flex-wrap items-center gap-0.5" role="tablist" aria-label={t("stickers.picker.tabs")}>
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === active.id}
              onClick={() => setActiveSetId(s.id)}
              title={setLabel(s)}
              className={[
                "max-w-[8rem] truncate whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs transition-colors",
                s.id === active.id
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              {setLabel(s)}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" className="flex flex-wrap items-center gap-0.5">
        {active.items.map((item) => {
          const isActive =
            selection.setId === active.id
              ? selection.itemId === item.id
              : item.kind === "emoji"
                ? selection.kind === "emoji" && selection.char === item.char
                : selection.kind === "image" && selection.src === item.src;
          const label = item.kind === "emoji" ? item.char : item.nameKey ? t(item.nameKey) : (item.name ?? item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(stickerSelectionFor(active.id, item))}
              title={label}
              aria-label={label}
              aria-pressed={isActive}
              className={[
                "flex items-center justify-center rounded transition-colors",
                item.kind === "emoji" ? "px-1.5 py-0.5 text-base leading-none" : "h-8 w-8 p-0.5",
                isActive
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              {item.kind === "emoji" ? (
                item.char
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
              )}
            </button>
          );
        })}
        {folder?.loading && <span className="text-xs text-[var(--fg-2)]">{t("stickers.picker.loading")}</span>}
        {folder?.error && <span className="text-xs text-destructive">{t("stickers.picker.failed")}</span>}
        {folder && !folder.loading && !folder.error && active.items.length === 0 && (
          <span className="text-xs text-[var(--fg-2)]">{t("stickers.picker.empty")}</span>
        )}
      </div>
    </div>
  );
}

/** Sticker tool: emoji/image picker + a "Size" control (range 12–200). */
export function StickerPanel({
  sizeCtx,
  selection,
  onSelect,
  showPicker,
}: {
  sizeCtx: NumCtx | null;
  selection: StickerSelection;
  onSelect: (sel: StickerSelection) => void;
  /** The picker shows only in tool mode; a selected sticker gets just Size. */
  showPicker: boolean;
}) {
  const { t } = useT();
  return (
    <Group>
      {showPicker && (
        <>
          <SectionLabel>{t("editor.panel.sticker")}</SectionLabel>
          <StickerPicker
            selection={selection}
            onSelect={onSelect}
          />
        </>
      )}
      {sizeCtx && (
        <>
          <SectionLabel>{t("editor.panel.size")}</SectionLabel>
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
