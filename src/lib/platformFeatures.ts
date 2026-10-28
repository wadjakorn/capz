import type { Platform } from "@/lib/shortcuts";

// Desktop features that depend on a native backend some platforms lack.
// Hidden rather than shown-and-failing (owner decision 2026-10-28, CP-0085).

/** OCR needs Vision (macOS) or Windows.Media.Ocr; there is no Linux engine. */
export function supportsOcr(platform: Platform): boolean {
  return platform !== "linux";
}

/** Auto-scroll posts synthetic wheel events (`synthetic_scroll.rs`), which
 *  Linux does not implement — scroll capture there is manual only. */
export function supportsAutoScroll(platform: Platform): boolean {
  return platform !== "linux";
}
