import type { StickyCapableTool } from "@/lib/config";
import { t, type TKey } from "@/i18n/store";

const STICKY_TOOL_KEYS: { id: StickyCapableTool; key: TKey }[] = [
  { id: "arrow", key: "app.tool.arrow" },
  { id: "rect", key: "app.tool.rect" },
  { id: "text", key: "app.tool.text" },
  { id: "blur", key: "app.tool.blur" },
  { id: "pen", key: "app.tool.pen" },
  { id: "highlighter", key: "app.tool.highlighter" },
  { id: "magnify", key: "app.tool.magnify" },
  { id: "sticker", key: "app.tool.sticker" },
  { id: "pin", key: "app.tool.pin" },
];

/**
 * Tools that carry a `general.keepToolActive` flag, in toolbar order. Labels
 * mirror the toolbar's TOOLS list so Settings and the editor name them
 * identically. Select and Crop are absent: they can never stay active.
 *
 * `label` is a getter resolved in the current UI language on each read, so
 * reading it at render time follows a language change.
 */
export const STICKY_TOOLS: { id: StickyCapableTool; label: string }[] =
  STICKY_TOOL_KEYS.map(({ id, key }) => ({
    id,
    get label() {
      return t(key);
    },
  }));

/** Toolbar label for a sticky-capable tool (falls back to the raw id). */
export function stickyToolLabel(id: string): string {
  return STICKY_TOOLS.find((s) => s.id === id)?.label ?? id;
}
