"use client";

import { useMemo } from "react";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import { isTauriRuntime } from "@/lib/platform";
import { folderItems, visibleStickerSets } from "@/lib/stickers/sets";
import type { StickerItem, StickerSet } from "@/lib/stickers/builtin";
import type { StickerSelection } from "@/stores/editor";

/** The picker's sets, in order: enabled built-ins plus enabled user folders
 * (desktop only — the web build has no folder access). */
export function useStickerSets(): StickerSet[] {
  const cfg = useSettings((s) => s.config.stickers);
  const folders = useStickers((s) => s.folders);
  return useMemo(() => {
    const loaded: Record<string, StickerItem[]> = {};
    for (const [id, f] of Object.entries(folders)) loaded[id] = folderItems(f.entries);
    return visibleStickerSets(cfg, loaded, isTauriRuntime());
  }, [cfg, folders]);
}

/** The editor selection for picking `item` from set `setId`. */
export function stickerSelectionFor(setId: string, item: StickerItem): StickerSelection {
  return item.kind === "emoji"
    ? { kind: "emoji", char: item.char, setId, itemId: item.id }
    : { kind: "image", src: item.src, name: item.name ?? item.id, setId, itemId: item.id };
}
