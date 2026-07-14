import { useEditor } from "@/stores/editor";
import { getStageImageSize } from "@/lib/stageBridge";

/** Load an image URL (data:, blob:, asset:) and resolve its natural size, or
 *  null if it fails to decode. */
function loadNaturalSize(
  src: string,
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const im = new window.Image();
    im.onload = () =>
      resolve({ w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/**
 * Add `src` as a layered `ImageAnnotation` centered on the current working
 * image, scaled to fit within it (transparent PNGs keep their alpha — no
 * matte). Resolves to the new annotation id, or null if the image failed to
 * load / had zero dimensions. Undo/redo, snapping and export come for free via
 * the store's `add()`.
 */
export async function addOverlayImage(src: string): Promise<string | null> {
  const natural = await loadNaturalSize(src);
  if (!natural || natural.w <= 0 || natural.h <= 0) return null;
  const base = getStageImageSize();
  // Fit to ~70% of the base working area (preserving aspect); never upscale
  // past natural size. With no base image yet, place at natural size.
  const maxW = base ? base.w * 0.7 : natural.w;
  const maxH = base ? base.h * 0.7 : natural.h;
  const fit = Math.min(1, maxW / natural.w, maxH / natural.h);
  const w = Math.max(8, Math.round(natural.w * fit));
  const h = Math.max(8, Math.round(natural.h * fit));
  const cx = base ? base.w / 2 : w / 2;
  const cy = base ? base.h / 2 : h / 2;
  const id = crypto.randomUUID();
  useEditor.getState().add({
    type: "image",
    id,
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    w,
    h,
    src,
  });
  return id;
}
