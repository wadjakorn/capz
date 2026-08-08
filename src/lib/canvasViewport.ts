import type { Viewport } from "next";

/**
 * Viewport for the route segments that own pinch-zoom themselves.
 *
 * The canvas implements its own pinch-zoom over a far wider range than the
 * browser's, and the browser's page zoom competes with it directly, so it is
 * suppressed — but only where that trade is actually paid for. Locking the
 * scale in the *root* layout would also cover `/`, a text-heavy marketing page
 * with no canvas and so no substitute zoom at all: a plain WCAG 1.4.4 failure
 * on the app's most-visited public URL. Every route segment that renders the
 * editor re-exports this from its own `layout.tsx`; everything else keeps
 * normal browser zoom.
 */
export const canvasViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
