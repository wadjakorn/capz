/** Where an incoming capture should go when it reaches the editor. */
export type CaptureRoute = "clear" | "base" | "prompt";

/**
 * Decide how an incoming capture is handled:
 * - `clear`  — no path (a clear/reset signal); wipe the workspace.
 * - `base`   — empty canvas; the capture becomes the base image, no prompt.
 * - `prompt` — non-empty canvas; ask the user to Replace or Add rather than
 *   silently discarding their work.
 *
 * `hasImage` is the store's "a base image is loaded" flag, which in this editor
 * is equivalent to "the canvas has work" (annotation tools are disabled without
 * a base, and clearing removes annotations too).
 */
export function routeIncomingCapture(
  path: string | null,
  hasImage: boolean,
): CaptureRoute {
  if (!path) return "clear";
  if (!hasImage) return "base";
  return "prompt";
}
