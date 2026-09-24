import type { StickyCapableTool } from "@/lib/config";

/**
 * Tools that carry a `general.keepToolActive` flag, in toolbar order. Labels
 * mirror the toolbar's TOOLS list so Settings and the editor name them
 * identically. Select and Crop are absent: they can never stay active.
 */
export const STICKY_TOOLS: { id: StickyCapableTool; label: string }[] = [
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Shapes" },
  { id: "text", label: "Text" },
  { id: "blur", label: "Blur" },
  { id: "pen", label: "Pen" },
  { id: "highlighter", label: "Highlighter" },
  { id: "magnify", label: "Magnify" },
  { id: "sticker", label: "Sticker" },
  { id: "pin", label: "Pin" },
];

/** Toolbar label for a sticky-capable tool (falls back to the raw id). */
export function stickyToolLabel(id: string): string {
  return STICKY_TOOLS.find((t) => t.id === id)?.label ?? id;
}
