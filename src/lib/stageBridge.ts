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
 * Fires when the stage has finished decoding a NEW base image.
 *
 * Workspace swapping needs this: EditorStage is not remounted when `src`
 * changes, so until the new bitmap lands `imageSize` and `exportBox` still
 * describe the PREVIOUS workspace's image. Anything that measures the stage
 * (scroll restore, thumbnails, export) has to wait for it.
 *
 * Keyed off the image object, NOT its dimensions — two captures of the same
 * window are the same pixel size, and a size-keyed signal simply never fires
 * for them, leaving a swap stuck "in progress".
 */
type ImageReadyListener = () => void;
const imageReadyListeners = new Set<ImageReadyListener>();

export function onStageImageReady(fn: ImageReadyListener): () => void {
  imageReadyListeners.add(fn);
  return () => {
    imageReadyListeners.delete(fn);
  };
}

/** Called by EditorStage once a new base image has decoded. */
export function notifyStageImageReady() {
  for (const fn of [...imageReadyListeners]) fn();
}

/**
 * The view a restored workspace should open at, handed to EditorStage before
 * its `src` changes.
 *
 * Exists so exactly ONE piece of code decides where a newly-loaded image sits.
 * EditorStage fits and centres a new image across two nested animation frames;
 * restoring a workspace's own zoom and pan from outside meant writing the same
 * scroll position a frame earlier and watching the centring overwrite it — the
 * canvas visibly slid. Now the restore is an input to that decision rather than
 * a competitor to it.
 *
 * Consumed once and cleared: a plain capture leaves it null and fits as always.
 */
export type PendingView = {
  /** Zoom to open at. 0 means "fit", the same sentinel displayScale uses. */
  scale: number;
  scroll: { left: number; top: number };
};

let pendingView: PendingView | null = null;

export function setPendingView(view: PendingView | null) {
  pendingView = view;
}

/** Read and clear the pending view. */
export function takePendingView(): PendingView | null {
  const v = pendingView;
  pendingView = null;
  return v;
}

export function setStageImageSize(w: number, h: number) {
  imageSize = { w, h };
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
