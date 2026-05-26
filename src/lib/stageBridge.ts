import type Konva from "konva";

let stage: Konva.Stage | null = null;
let prepareExport: (() => void) | null = null;
let imageSize: { w: number; h: number } | null = null;
let scrollContainer: HTMLDivElement | null = null;

export function setStage(s: Konva.Stage | null) {
  stage = s;
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

export function setStageImageSize(w: number, h: number) {
  imageSize = { w, h };
}

export function clearStageImageSize() {
  imageSize = null;
}

export function getStageImageSize(): { w: number; h: number } | null {
  return imageSize;
}

export function setScrollContainer(el: HTMLDivElement | null) {
  scrollContainer = el;
}

export function getScrollContainer(): HTMLDivElement | null {
  return scrollContainer;
}
