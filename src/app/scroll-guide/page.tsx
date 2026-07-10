"use client";

/**
 * Transparent, click-through overlay that outlines the capture region during a
 * scrolling capture so the user can see exactly what is being grabbed while
 * they scroll. Its window is sized to the region **plus** a 2px ring on every
 * side (see `windows::show_scroll_guide`) and positioned so the border sits
 * entirely *outside* the captured pixels — the sampler crops to the region, so
 * anything drawn over it would be baked into every frame (ticket ixD-igh14WRG).
 * For that reason the interior must stay fully transparent: no inset shadow, no
 * glow, nothing that paints even 1px inward.
 *
 * The whole window ignores cursor events (set on the Rust side), so scroll
 * wheel / clicks pass straight through to the page underneath.
 */
export default function ScrollGuidePage() {
  return (
    <>
      {/* Clear the opaque app background (globals.css sets body → var(--bg)) at
          first paint. Doing this in an effect instead would let the window show
          an opaque rectangle over the region until hydration — and a frame
          sampled in that gap would bake the dark fill into the capture. */}
      <style>{`html, body { background: transparent !important; }`}</style>
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
          pointerEvents: "none",
        }}
      />
    </>
  );
}
