import type Konva from "konva";

/** Export region in image-pixel coords. Origin may be negative when an element
 *  overflows the image's top/left edge. Published by EditorStage; consumed by
 *  the export pipeline so the snapshot covers the full (possibly expanded)
 *  canvas rather than just the image rect. */
export type ExportBox = { x: number; y: number; w: number; h: number };

let stage: Konva.Stage | null = null;
let prepareExport: (() => void) | null = null;
let imageSize: { w: number; h: number } | null = null;
let exportBox: ExportBox | null = null;
let scrollContainer: HTMLDivElement | null = null;

export function setStage(s: Konva.Stage | null) {
  stage = s;
  if (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_TEST === "1"
  ) {
    (window as unknown as { __capzStage: Konva.Stage | null }).__capzStage = s;
  }
}

export function getStage(): Konva.Stage | null {
  return stage;
}

export function setPrepareExport(fn: (() => void) | null) {
  prepareExport = fn;
}

export function runPrepareExport(): void {
  prepareExport?.();
}

/**
 * Fires whenever the stage publishes a base-image size — i.e. a new image has
 * finished decoding. Workspace swapping needs this: EditorStage is not
 * remounted when `src` changes, so until the new bitmap lands `imageSize` and
 * `exportBox` still describe the PREVIOUS workspace's image. Anything that
 * measures the stage (scroll restore, thumbnails, export) has to wait for it.
 */
type ImageSizeListener = (size: { w: number; h: number }) => void;
const imageSizeListeners = new Set<ImageSizeListener>();

export function onStageImageSize(fn: ImageSizeListener): () => void {
  imageSizeListeners.add(fn);
  return () => {
    imageSizeListeners.delete(fn);
  };
}

export function setStageImageSize(w: number, h: number) {
  imageSize = { w, h };
  for (const fn of imageSizeListeners) fn({ w, h });
}

export function clearStageImageSize() {
  imageSize = null;
}

export function getStageImageSize(): { w: number; h: number } | null {
  return imageSize;
}

export function setStageExportBox(box: ExportBox | null) {
  exportBox = box;
}

export function getStageExportBox(): ExportBox | null {
  return exportBox;
}

export function setScrollContainer(el: HTMLDivElement | null) {
  scrollContainer = el;
}

export function getScrollContainer(): HTMLDivElement | null {
  return scrollContainer;
}
