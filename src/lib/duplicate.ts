import { useEditor, type Tool } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { annotationAABB, type AABB } from "@/lib/annotationBounds";
import { getStageImageSize } from "@/lib/stageBridge";

/** How far (image px) a duplicate lands from its source, per axis. */
export const DUPLICATE_OFFSET = 10;
/** Shown in the Duplicate button tooltip; handled in useEditorShortcuts. */
export const DUPLICATE_SHORTCUT = "CmdOrCtrl+D";

/**
 * Offset for a copy of a box `aabb` on an image of size `bounds`: +d on each
 * axis (default 10), flipped to -d on an axis where the copy would run past
 * the right/bottom edge AND the flipped copy still starts inside the image.
 * With either side unknown it stays +d (the canvas grows to show overflow
 * anyway). Paste (CP-0068) reuses it with d = 16.
 */
export function duplicateOffset(
  aabb: AABB | null,
  bounds: { w: number; h: number } | null,
  d: number = DUPLICATE_OFFSET,
): { dx: number; dy: number } {
  if (!aabb || !bounds) return { dx: d, dy: d };
  const axis = (start: number, size: number, limit: number) =>
    start + size + d > limit && start - d >= 0 ? -d : d;
  return {
    dx: axis(aabb.x, aabb.w, bounds.w),
    dy: axis(aabb.y, aabb.h, bounds.h),
  };
}

/** Duplicate needs a selection and is off while cropping. */
export function canDuplicate(s: { tool: Tool; selectedId: string | null }): boolean {
  return !!s.selectedId && s.tool !== "crop";
}

/**
 * Duplicate the selected annotation (⌘D / Ctrl+D and the panel button). The
 * copy becomes the selection, so repeating chains off the latest copy. Returns
 * the copy's id, or null when there was nothing to duplicate.
 */
export function duplicateSelected(): string | null {
  const s = useEditor.getState();
  if (!canDuplicate(s)) return null;
  const src = s.annotations.find((a) => a.id === s.selectedId);
  if (!src) return null;
  const id = s.duplicate(src.id, duplicateOffset(annotationAABB(src), getStageImageSize()));
  if (id && src.type === "pin") {
    // Same bookkeeping as dropping a pin (EditorStage), so pin continuity
    // across captures picks up after the copy's number.
    const n = useEditor.getState().nextPinNumber - 1;
    void useSettings.getState().update("pins", { lastUsedNumber: n });
  }
  return id;
}
