import type { AppConfig, StickerFolder } from "@/lib/config";
import { BUILTIN_STICKER_SETS, type StickerItem, type StickerSet } from "./builtin";

type StickersConfig = AppConfig["stickers"];

/** Every set id in picker order: `order` first (unknown ids dropped), then any
 * built-in or folder set it doesn't mention yet, in default order. */
export function orderedSetIds(cfg: StickersConfig): string[] {
  const known = [...BUILTIN_STICKER_SETS.map((s) => s.id), ...cfg.folders.map((f) => f.id)];
  const head = cfg.order.filter((id, i) => known.includes(id) && cfg.order.indexOf(id) === i);
  return [...head, ...known.filter((id) => !head.includes(id))];
}

export function isSetEnabled(cfg: StickersConfig, id: string): boolean {
  const folder = cfg.folders.find((f) => f.id === id);
  return folder ? folder.enabled : !cfg.disabledBuiltins.includes(id);
}

/** Folder sticker files (from `list_stickers`) as set items. */
export function folderItems(entries: { name: string; dataUrl: string }[]): StickerItem[] {
  return entries.map((e) => ({ id: e.name, kind: "image", src: e.dataUrl, name: e.name }));
}

/**
 * The sets shown as picker tabs, in order. Folder sets appear even before
 * their files load (`items` empty) so the tab doesn't jump in later. With
 * `includeFolders` false (the web build) folder sets are left out.
 */
export function visibleStickerSets(
  cfg: StickersConfig,
  loaded: Record<string, StickerItem[]>,
  includeFolders = true,
): StickerSet[] {
  const out: StickerSet[] = [];
  for (const id of orderedSetIds(cfg)) {
    if (!isSetEnabled(cfg, id)) continue;
    const builtin = BUILTIN_STICKER_SETS.find((s) => s.id === id);
    if (builtin) {
      out.push(builtin);
      continue;
    }
    const folder = cfg.folders.find((f) => f.id === id);
    if (folder && includeFolders) {
      out.push({ id, source: "dir", name: folder.name, items: loaded[id] ?? [] });
    }
  }
  // Never leave the picker empty: a hand-edited store could disable everything.
  return out.length ? out : [BUILTIN_STICKER_SETS[0]];
}

export function findStickerItem(
  sets: readonly StickerSet[],
  setId: string,
  itemId: string,
): StickerItem | undefined {
  return sets.find((s) => s.id === setId)?.items.find((i) => i.id === itemId);
}

/** Move `id` one step up (-1) or down (+1) in the full picker order. */
export function moveSetId(cfg: StickersConfig, id: string, delta: -1 | 1): string[] {
  const ids = orderedSetIds(cfg);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/** Can `id` be switched off without leaving no set enabled? */
export function canDisableSet(cfg: StickersConfig, id: string): boolean {
  return orderedSetIds(cfg).some((other) => other !== id && isSetEnabled(cfg, other));
}

export type { StickerFolder };
