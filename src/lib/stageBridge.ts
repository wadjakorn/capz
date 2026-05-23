import type Konva from "konva";

let stage: Konva.Stage | null = null;
let prepareExport: (() => void) | null = null;

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
