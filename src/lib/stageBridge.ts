import type Konva from "konva";

let stage: Konva.Stage | null = null;

export function setStage(s: Konva.Stage | null) {
  stage = s;
}

export function getStage(): Konva.Stage | null {
  return stage;
}
