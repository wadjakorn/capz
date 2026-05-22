"use client";

import { create } from "zustand";

export type Tool =
  | "select"
  | "arrow"
  | "rect"
  | "text"
  | "blur"
  | "sticker"
  | "pin";

type Base = { id: string; rotation?: number };

export type RectAnnotation = Base & {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
};

export type ArrowAnnotation = Base & {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

export type TextAnnotation = Base & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
};

export type BlurAnnotation = Base & {
  type: "blur";
  x: number;
  y: number;
  w: number;
  h: number;
  blurRadius: number;
};

export type StickerAnnotation = Base & {
  type: "sticker";
  x: number;
  y: number;
  char: string;
  fontSize: number;
};

export type PinAnnotation = Base & {
  type: "pin";
  x: number;
  y: number;
  number: number;
  color: string;
  size: number;
};

export type Annotation =
  | RectAnnotation
  | ArrowAnnotation
  | TextAnnotation
  | BlurAnnotation
  | StickerAnnotation
  | PinAnnotation;

export const STICKERS = [
  "⭐",
  "❤️",
  "✅",
  "❌",
  "👍",
  "👎",
  "🔥",
  "💡",
  "⚠️",
  "🎯",
] as const;

type Snapshot = { annotations: Annotation[]; nextPinNumber: number };

type State = {
  tool: Tool;
  annotations: Annotation[];
  selectedId: string | null;
  stickerChar: string;
  nextPinNumber: number;
  past: Snapshot[];
  future: Snapshot[];

  setTool: (t: Tool) => void;
  setStickerChar: (c: string) => void;
  setNextPinNumber: (n: number) => void;
  select: (id: string | null) => void;
  add: (a: Annotation) => void;
  update: (id: string, patch: Partial<Annotation>) => void;
  remove: (id: string) => void;
  clear: () => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
};

const HISTORY_LIMIT = 100;

function pushHistory(past: Snapshot[], snap: Snapshot): Snapshot[] {
  const next = [...past, snap];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

export const useEditor = create<State>((set, get) => ({
  tool: "select",
  annotations: [],
  selectedId: null,
  stickerChar: STICKERS[0],
  nextPinNumber: 1,
  past: [],
  future: [],

  setTool: (t) =>
    set({ tool: t, selectedId: t === "select" ? get().selectedId : null }),
  setStickerChar: (c) => set({ stickerChar: c }),
  setNextPinNumber: (n) => set({ nextPinNumber: n }),
  select: (id) => set({ selectedId: id }),

  add: (a) => {
    const { annotations, nextPinNumber, past } = get();
    const advancePin = a.type === "pin";
    set({
      annotations: [...annotations, a],
      past: pushHistory(past, { annotations, nextPinNumber }),
      future: [],
      selectedId: a.id,
      nextPinNumber: advancePin ? a.number + 1 : nextPinNumber,
    });
  },

  update: (id, patch) => {
    const { annotations, nextPinNumber, past } = get();
    const next = annotations.map((x) =>
      x.id === id ? ({ ...x, ...patch } as Annotation) : x,
    );
    set({
      annotations: next,
      past: pushHistory(past, { annotations, nextPinNumber }),
      future: [],
    });
  },

  remove: (id) => {
    const { annotations, nextPinNumber, past, selectedId } = get();
    set({
      annotations: annotations.filter((x) => x.id !== id),
      past: pushHistory(past, { annotations, nextPinNumber }),
      future: [],
      selectedId: selectedId === id ? null : selectedId,
    });
  },

  clear: () => {
    const { annotations, nextPinNumber, past } = get();
    if (!annotations.length) return;
    set({
      annotations: [],
      past: pushHistory(past, { annotations, nextPinNumber }),
      future: [],
      selectedId: null,
    });
  },

  reset: () =>
    set({
      annotations: [],
      selectedId: null,
      past: [],
      future: [],
    }),

  undo: () => {
    const { past, future, annotations, nextPinNumber } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      annotations: prev.annotations,
      nextPinNumber: prev.nextPinNumber,
      past: past.slice(0, -1),
      future: [{ annotations, nextPinNumber }, ...future],
      selectedId: null,
    });
  },

  redo: () => {
    const { past, future, annotations, nextPinNumber } = get();
    if (!future.length) return;
    const next = future[0];
    set({
      annotations: next.annotations,
      nextPinNumber: next.nextPinNumber,
      past: [...past, { annotations, nextPinNumber }],
      future: future.slice(1),
      selectedId: null,
    });
  },
}));
