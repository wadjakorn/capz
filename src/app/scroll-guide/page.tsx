"use client";

import { useEffect } from "react";

/**
 * Transparent, click-through overlay that outlines the capture region during a
 * scrolling capture so the user can see exactly what is being grabbed while
 * they scroll. Its window is sized to the region **plus** a 2px ring on every
 * side (see `windows::show_scroll_guide`) and positioned so the border sits
 * entirely *outside* the captured pixels — the sampler crops to the region, so
 * anything drawn over it would be baked into every frame (ticket ixD-igh14WRG).
 *
 * The whole window ignores cursor events (set on the Rust side), so scroll
 * wheel / clicks pass straight through to the page underneath.
 */
export default function ScrollGuidePage() {
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        boxSizing: "border-box",
        width: "100vw",
        height: "100vh",
        // 2px matches GUIDE_BORDER in windows.rs; the window is exactly the
        // region + 2px on each side, so this ring lands just outside the
        // captured area and never appears in the stitched PNG.
        border: "2px solid var(--accent)",
        background: "transparent",
        // Soft inner glow to lift the outline off busy page content without
        // spilling into the captured region (inset only).
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    />
  );
}
