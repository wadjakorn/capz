import type { BackdropConfig } from "@/lib/config";
import type { CaptureSource } from "@/stores/editor";

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

/**
 * How a non-capture image reached the editor (mirrors Rust `LoadOrigin`).
 * Absent for captures and for anything restored rather than newly opened.
 */
export type LoadOrigin = "paste" | "import";

/**
 * Whether a freshly loaded base image starts with the padded backdrop on, per
 * the user's auto-backdrop settings. A non-capture image with no origin (e.g.
 * the image restored at startup) never switches it on by itself.
 */
export function autoBackdropFor(
  bd: Pick<
    BackdropConfig,
    "autoForFull" | "autoForArea" | "autoForWindow" | "autoForPaste" | "autoForImport"
  >,
  source: CaptureSource,
  origin?: LoadOrigin,
): boolean {
  switch (source) {
    case "full":
      return bd.autoForFull;
    case "area":
    case "systemArea":
      return bd.autoForArea;
    case "window":
      return bd.autoForWindow;
    case "other":
      if (origin === "paste") return bd.autoForPaste;
      if (origin === "import") return bd.autoForImport;
      return false;
    default:
      return false;
  }
}
