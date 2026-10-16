import type { AppConfig } from "@/lib/config";
import { annotationAABB, type AABB } from "@/lib/annotationBounds";
import { uid } from "@/lib/uid";
import {
  cloneAnnotation,
  shiftAnnotation,
  type Annotation,
  type EditorDoc,
  type ImageCrop,
} from "@/stores/editor";

type Backdrop = AppConfig["general"]["backdrop"];

/** Explicit allow-list: any autoFor* key must stay out of a template. */
export type BackdropLook = Pick<
  Backdrop,
  "style" | "presetId" | "solidColor" | "padding" | "cornerRadius" | "shadow"
>;

export type EditTemplate = {
  id: string;
  name: string;
  createdAt: number;
  sourceSize: { w: number; h: number };
  crop?: ImageCrop;
  backdropOn?: boolean;
  backdropLook?: BackdropLook;
  /** In base-image space (crop offset removed), in source z-order. */
  annotations: Annotation[];
  thumb: string;
};

export type TemplateSelection = {
  crop: boolean;
  backdropOn: boolean;
  backdropLook: boolean;
  annotationIds: ReadonlySet<string>;
};

export type TemplatePatch = {
  annotations: Annotation[];
  nextPinNumber: number;
  imageCrop: ImageCrop | null;
  backdropOn: boolean;
  cropChanged: boolean;
  maxPinNumber: number | null;
};

export type ApplyResult = {
  patch: TemplatePatch;
  cropSkipped: boolean;
  scaleMismatch: boolean;
};

export type ApplyTarget = Pick<
  EditorDoc,
  "annotations" | "nextPinNumber" | "imageCrop" | "backdropOn"
>;

type Size = { w: number; h: number };

export function pickBackdropLook(b: Backdrop): BackdropLook {
  return structuredClone({
    style: b.style,
    presetId: b.presetId,
    solidColor: b.solidColor,
    padding: b.padding,
    cornerRadius: b.cornerRadius,
    shadow: b.shadow,
  });
}

export function captureTemplate(
  doc: ApplyTarget,
  sourceSize: Size,
  backdrop: Backdrop,
  sel: TemplateSelection,
  meta: { id: string; name: string; createdAt: number; thumb: string },
): EditTemplate {
  const o = doc.imageCrop ?? { x: 0, y: 0 };
  const tpl: EditTemplate = {
    ...meta,
    sourceSize: { w: sourceSize.w, h: sourceSize.h },
    annotations: doc.annotations
      .filter((a) => sel.annotationIds.has(a.id))
      .map((a) => cloneAnnotation(a, a.id, o.x, o.y)),
  };
  if (sel.crop && doc.imageCrop) tpl.crop = { ...doc.imageCrop };
  if (sel.backdropOn) tpl.backdropOn = doc.backdropOn;
  if (sel.backdropLook) tpl.backdropLook = pickBackdropLook(backdrop);
  return tpl;
}

const sizeEq = (a: Size, b: Size) => a.w === b.w && a.h === b.h;
const cropEq = (a: ImageCrop | null, b: ImageCrop | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Same axis rule as clampIntoBounds in elementClipboard.ts (copied, not imported). */
function axisDelta(start: number, size: number, limit: number): number {
  if (size >= limit || start < 0) return -start;
  if (start + size > limit) return limit - size - start;
  return 0;
}

/** Delta bringing a fully-outside item just inside `area`; 0,0 otherwise. */
function moveInDelta(a: Annotation, area: Size): { dx: number; dy: number } {
  const raw = annotationAABB(a);
  if (!raw) return { dx: 0, dy: 0 };
  const b: AABB = {
    x: Math.min(raw.x, raw.x + raw.w),
    y: Math.min(raw.y, raw.y + raw.h),
    w: Math.abs(raw.w),
    h: Math.abs(raw.h),
  };
  const outside = b.x + b.w < 0 || b.y + b.h < 0 || b.x > area.w || b.y > area.h;
  if (!outside) return { dx: 0, dy: 0 };
  return { dx: axisDelta(b.x, b.w, area.w), dy: axisDelta(b.y, b.h, area.h) };
}

const near = (v: number, target: number) => Math.abs(v / target - 1) <= 0.03;

export function applyTemplate(
  target: ApplyTarget,
  tpl: EditTemplate,
  sel: TemplateSelection,
  targetSize: Size,
): ApplyResult {
  // 1. crop
  const oldCrop = target.imageCrop;
  let imageCrop = oldCrop;
  let cropSkipped = false;
  if (sel.crop && tpl.crop) {
    const c = tpl.crop;
    const fits =
      c.x >= 0 && c.y >= 0 && c.x + c.w <= targetSize.w && c.y + c.h <= targetSize.h;
    if (fits) imageCrop = { ...c };
    else cropSkipped = true;
  }
  const cropChanged = !cropEq(oldCrop, imageCrop);

  // 2. re-base existing annotations
  const existing = cropChanged
    ? target.annotations.map((a) =>
        shiftAnnotation(
          a,
          (oldCrop?.x ?? 0) - (imageCrop?.x ?? 0),
          (oldCrop?.y ?? 0) - (imageCrop?.y ?? 0),
        ),
      )
    : target.annotations;

  // 3-4. template annotations into the working area
  const origin = imageCrop ?? { x: 0, y: 0 };
  const area: Size = imageCrop ? { w: imageCrop.w, h: imageCrop.h } : targetSize;
  const exact = sizeEq(targetSize, tpl.sourceSize) && cropEq(imageCrop, tpl.crop ?? null);
  const added = tpl.annotations
    .filter((a) => sel.annotationIds.has(a.id))
    .map((a) => {
      const placed = cloneAnnotation(a, uid(), -origin.x, -origin.y);
      if (exact) return placed;
      const { dx, dy } = moveInDelta(placed, area);
      return dx || dy ? shiftAnnotation(placed, dx, dy) : placed;
    });

  // 6. pins
  let maxPinNumber: number | null = null;
  for (const a of added) {
    if (a.type === "pin" && (maxPinNumber === null || a.number > maxPinNumber)) {
      maxPinNumber = a.number;
    }
  }
  const nextPinNumber =
    maxPinNumber === null
      ? target.nextPinNumber
      : Math.max(target.nextPinNumber, maxPinNumber + 1);

  // 7. backdrop on
  const backdropOn =
    sel.backdropOn && tpl.backdropOn !== undefined ? tpl.backdropOn : target.backdropOn;

  // 9. scale mismatch
  const scaleMismatch =
    tpl.sourceSize.w > 0 &&
    tpl.sourceSize.h > 0 &&
    ((near(targetSize.w, tpl.sourceSize.w * 2) && near(targetSize.h, tpl.sourceSize.h * 2)) ||
      (near(targetSize.w, tpl.sourceSize.w / 2) && near(targetSize.h, tpl.sourceSize.h / 2)));

  return {
    patch: {
      annotations: [...existing, ...added],
      nextPinNumber,
      imageCrop,
      backdropOn,
      cropChanged,
      maxPinNumber,
    },
    cropSkipped,
    scaleMismatch,
  };
}

export function templateItemCount(tpl: EditTemplate): number {
  return (
    (tpl.crop ? 1 : 0) +
    (tpl.backdropOn !== undefined ? 1 : 0) +
    (tpl.backdropLook ? 1 : 0) +
    tpl.annotations.length
  );
}

export function templateBytes(tpl: EditTemplate): number {
  return JSON.stringify(tpl).length;
}

export function imageAnnotationBytes(tpl: EditTemplate): number {
  let n = 0;
  for (const a of tpl.annotations) if (a.type === "image") n += a.src.length;
  return n;
}
