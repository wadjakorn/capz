import type { Annotation, DimLevel, RectAnnotation } from "@/stores/editor";

/**
 * Spotlight dim (CP-0095). A rect / ellipse with `dim` set darkens the image
 * around it. All such shapes share ONE overlay, drawn right above the base
 * image and below every annotation, clipped to the image rect — so the padded
 * backdrop and the overflow band are never dimmed, and arrows / text drawn
 * around the spotlight stay crisp.
 *
 * The holes are cut with one even-odd clip per shape (image rect + hole).
 * Successive clips intersect, so what is left is image − ∪holes: overlapping
 * holes stay clear, which a single even-odd or non-zero path cannot give.
 */

export const DIM_LEVELS: readonly DimLevel[] = ["light", "medium", "strong"];

export const DIM_OPACITY: Record<DimLevel, number> = {
  light: 0.35,
  medium: 0.55,
  strong: 0.75,
};

export function isSpotlight(a: Annotation): a is RectAnnotation & { dim: DimLevel } {
  return a.type === "rect" && a.shape !== "line" && !!a.dim;
}

export function spotlightShapes(anns: readonly Annotation[]): (RectAnnotation & { dim: DimLevel })[] {
  return anns.filter(isSpotlight);
}

/** The level the image is dimmed at: the strongest one present, or null. The
 *  toolbar keeps every spotlight on one level, so this only differs from "the"
 *  level for documents built before that (or mixed by a template). */
export function spotlightLevel(anns: readonly Annotation[]): DimLevel | null {
  let best = -1;
  for (const a of anns) {
    if (!isSpotlight(a)) continue;
    best = Math.max(best, DIM_LEVELS.indexOf(a.dim));
  }
  return best < 0 ? null : DIM_LEVELS[best];
}

/** A hole in the node's local box (0,0,w,h), placed by the affine `m`. */
export type SpotlightHole = {
  kind: "rect" | "ellipse";
  w: number;
  h: number;
  cornerRadius: number;
  m: readonly [number, number, number, number, number, number] | readonly number[];
};

/** The bits of a Konva node the hole reads; a live node wins over the stored
 *  annotation so the hole follows a drag / Transformer resize as it happens. */
export type SpotlightNode = {
  width(): number;
  height(): number;
  getTransform(): { getMatrix(): number[] };
};

export function spotlightHole(a: RectAnnotation, node: SpotlightNode | undefined): SpotlightHole {
  const kind = a.shape === "ellipse" ? "ellipse" : "rect";
  const cornerRadius = kind === "rect" ? Math.max(0, a.cornerRadius ?? 0) : 0;
  if (node) {
    return { kind, w: node.width(), h: node.height(), cornerRadius, m: node.getTransform().getMatrix() };
  }
  const r = ((a.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { kind, w: a.w, h: a.h, cornerRadius, m: [cos, sin, 0 - sin, cos, a.x, a.y] };
}

/** Konva's rounded rect: the radius is clamped to half the short side. */
function roundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  const r = Math.min(Math.max(0, radius), w / 2, h / 2);
  if (r <= 0) {
    ctx.rect(0, 0, w, h);
    return;
  }
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

/** Paint the overlay in image coordinates: `area` is the (possibly rounded)
 *  image rect at the origin. A native 2D context is required — Konva's
 *  wrapper does not forward clip's fill rule. */
export function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  area: { w: number; h: number; radius: number },
  holes: readonly SpotlightHole[],
  opacity: number,
): void {
  if (holes.length === 0 || area.w <= 0 || area.h <= 0) return;
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, area.w, area.h, area.radius);
  ctx.clip();
  for (const hole of holes) {
    if (!(hole.w > 0 && hole.h > 0)) continue;
    ctx.beginPath();
    ctx.rect(0, 0, area.w, area.h);
    ctx.save();
    const [a, b, c, d, e, f] = hole.m;
    ctx.transform(a, b, c, d, e, f);
    if (hole.kind === "ellipse") {
      ctx.moveTo(hole.w, hole.h / 2);
      ctx.ellipse(hole.w / 2, hole.h / 2, hole.w / 2, hole.h / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
    } else {
      roundedRect(ctx, hole.w, hole.h, hole.cornerRadius);
    }
    ctx.restore();
    ctx.clip("evenodd");
  }
  ctx.fillStyle = `rgba(0,0,0,${opacity})`;
  ctx.fillRect(0, 0, area.w, area.h);
  ctx.restore();
}
