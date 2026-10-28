import type { AppConfig } from "@/lib/config";
import { useEditor } from "@/stores/editor";
import { useSettings } from "@/stores/settings";

type LastUsed = NonNullable<AppConfig["lastUsed"]>;

/** Per-tool slots: merged field-by-field, never replaced wholesale. */
const SLOTS = [
  "rect",
  "arrow",
  "text",
  "blur",
  "pen",
  "highlighter",
  "magnify",
  "sticker",
  "pin",
] as const;

const DEBOUNCE_MS = 500;

// One editor stage per webview, so a module-level pending patch is shared by
// the canvas (debounced) and the Toolbar (immediate) writers (CP-0077).
let pending: LastUsed = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function mergeSlots(cur: LastUsed, patch: LastUsed): LastUsed {
  const merged: LastUsed = { ...cur, ...patch };
  const out = merged as Record<string, unknown>;
  for (const s of SLOTS) out[s] = { ...cur[s], ...patch[s] };
  return merged;
}

function flush() {
  timer = null;
  const cur = useSettings.getState().config.lastUsed ?? {};
  const patch = pending;
  pending = {};
  const merged: LastUsed = {
    ...mergeSlots(cur, patch),
    // "crop" is a transient mode, not a persistable last-used tool.
    tool: (() => {
      const t = useEditor.getState().tool;
      return t === "crop" ? cur.tool : t;
    })(),
    stickerItem: patch.stickerItem ?? cur.stickerItem,
  };
  void useSettings.getState().setLastUsed(merged);
}

/** Debounced write of the defaults implied by a drawn / edited annotation.
 *  Each slot in `patch` replaces the pending slot. */
export function scheduleLastUsed(patch: LastUsed) {
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

/** Forget every `slot.field` (and top-level key) in `patch` from the pending
 *  write, so an explicit pick made inside the debounce window is not undone. */
export function dropPendingLastUsed(patch: LastUsed) {
  const next = { ...pending } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if ((SLOTS as readonly string[]).includes(key) && value && typeof value === "object") {
      const slot = next[key];
      if (!slot) continue;
      const rest = { ...(slot as Record<string, unknown>) };
      for (const f of Object.keys(value)) delete rest[f];
      next[key] = rest;
    } else {
      delete next[key];
    }
  }
  pending = next as LastUsed;
}

export function cancelLastUsed() {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = {};
}

/** Immediate write of an explicit pick (Toolbar). Wins over any pending
 *  canvas-derived value for the same fields. */
export function writeLastUsedNow(patch: LastUsed) {
  dropPendingLastUsed(patch);
  const cur = useSettings.getState().config.lastUsed ?? {};
  void useSettings.getState().setLastUsed(mergeSlots(cur, patch));
}
