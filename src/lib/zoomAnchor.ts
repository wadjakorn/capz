/**
 * New scroll offset for one axis that keeps the image-coordinate point under
 * `anchorClient` pinned across a scale change.
 *
 * `rectBefore` / `rectAfter` are the container's bounding-rect edge on this
 * axis before and after the new scale has reflowed - the rect moves because
 * changing the scale resizes the sizer around the Stage.
 *
 * Shared by the wheel path and the pinch path so the two cannot drift apart.
 */
export function anchoredScrollOffset(
  current: number,
  anchorClient: number,
  rectBefore: number,
  rectAfter: number,
  oldScale: number,
  newScale: number,
): number {
  // scale 0 is the store's "re-fit on next paint" sentinel; nothing to pin to.
  if (oldScale <= 0) return current;
  const ratio = newScale / oldScale;
  return current + rectAfter - anchorClient + (anchorClient - rectBefore) * ratio;
}
