/** Where an incoming capture should go when it reaches the editor. */
export type CaptureRoute = "clear" | "base";

/**
 * Decide how an incoming capture is handled:
 * - `clear` — no path (a clear/reset signal); wipe the workspace.
 * - `base`  — the capture becomes the base image, replacing whatever was there.
 *
 * Replacement is unconditional: there is no "Replace or add?" prompt. Adding a
 * capture as a layer is a separate intent the user expresses *before*
 * capturing, via the editor's capture-as-layer split button, and is routed by
 * the `asLayer` flag on the load-image payload rather than by this function.
 */
export function routeIncomingCapture(path: string | null): CaptureRoute {
  return path ? "base" : "clear";
}
