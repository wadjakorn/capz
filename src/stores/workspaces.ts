"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";

import {
  readEditorDoc,
  useEditor,
  type Annotation,
  type CaptureSource,
  type EditorDoc,
  type ImageCrop,
} from "@/stores/editor";
import { isTauriRuntime } from "@/lib/platform";
import { getScrollContainer, getStage, getStageExportBox } from "@/lib/stageBridge";
import { uid } from "@/lib/uid";

export const WORKSPACE_STORE_FILE = "workspaces.json";

/**
 * Where a workspace's pixels live.
 *
 * Desktop keeps a durable copy under `$APPDATA/workspaces/` (see
 * src-tauri/src/services/workspace_store.rs) because the `capz-temp-*` file a
 * capture arrives in is deleted on the next swap and swept after 24h. The web
 * build has no filesystem to copy into, so it holds the Blob's object URL and
 * the whole set dies with the tab — which is why web workspaces are never
 * persisted and the user is told so once.
 */
export type WorkspaceImage =
  | { kind: "file"; path: string }
  | { kind: "blob"; url: string };

export type WorkspaceDoc = EditorDoc & {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Absent while the workspace is empty (created by hand, or cleared). */
  image: WorkspaceImage | null;
  /**
   * The temp path the capture arrived on, before it was copied somewhere
   * durable. Kept solely so the same capture cannot be adopted twice — the
   * durable copy gets a fresh name per workspace, so it cannot serve as the key.
   */
  sourcePath?: string;
  /** Data URL, ~160px wide. Empty until the first thumbnail is rendered. */
  thumb: string;
  /**
   * Pan position. Lives on the DOM scroll container rather than in `useEditor`,
   * so it is captured and restored here instead of riding along in EditorDoc.
   */
  scroll: { left: number; top: number };
};

/** Three heights, one value: `hidden` is derived, never chosen by the user. */
export type BarMode = "hidden" | "rail" | "full";

/** A closed workspace held for the undo window. */
type ClosedWorkspace = { doc: WorkspaceDoc; index: number; at: number };

type State = {
  ready: boolean;
  /** Left-to-right order; index + 1 is the number shown on each tile. */
  order: string[];
  activeId: string | null;
  docs: Record<string, WorkspaceDoc>;
  /** User's own choice; `hidden` is computed in `barMode()`. */
  barPref: Exclude<BarMode, "hidden">;
  /** Once true, the short-window auto-collapse never fires again. */
  barPrefUserSet: boolean;
  /**
   * True between "leaving workspace A" and "B's bitmap has decoded". The stage
   * is not remounted on a src change, so during this window every stage
   * measurement still describes A — thumbnails and export must stand down.
   */
  swapping: boolean;
  /** Most recently closed workspace, for Undo / "Reopen last closed". */
  lastClosed: ClosedWorkspace | null;

  init: (enabled: boolean) => Promise<void>;
  /** Snapshot the live editor into the active doc (incl. a fresh thumbnail). */
  commitActive: () => void;
  adoptCapture: (
    path: string,
    source: CaptureSource,
    mode: "new" | "replace",
    max: number,
  ) => Promise<string | null>;
  adoptBlob: (url: string, max: number) => string;
  /**
   * Point the active workspace at an image, creating a first workspace if
   * there is none. Used by the web build, where an image arrives as a Blob
   * from paste/drop/capture rather than as a capture event from Rust.
   */
  setActiveImage: (image: WorkspaceImage) => string;
  createEmpty: (max: number) => string;
  switchTo: (id: string) => void;
  close: (id: string) => void;
  reopenLastClosed: () => void;
  clearActive: () => void;
  closeOthers: () => void;
  setThumb: (id: string, thumb: string) => void;
  setBarPref: (pref: Exclude<BarMode, "hidden">, userSet?: boolean) => void;
  setSwapping: (v: boolean) => void;
  /** Drop every workspace but the active one (turning the feature off). */
  collapseToActive: () => void;
};

/**
 * Undo history, kept out of the store and off disk on purpose. Snapshots embed
 * layered images as data URLs, so persisting 100 of them per workspace would
 * put megabytes through the store file on every write. Swapping keeps undo
 * within a session; quitting starts each workspace with a clean history.
 */
const historyStacks = new Map<
  string,
  { past: unknown[]; future: unknown[] }
>();

const emptyDoc = (id: string): WorkspaceDoc => ({
  id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  image: null,
  thumb: "",
  annotations: [],
  nextPinNumber: 1,
  imageCrop: null,
  backdropOn: false,
  captureSource: "other",
  displayScale: 0,
  userZoomed: false,
  scroll: { left: 0, top: 0 },
});

/** Whether a doc holds work the user would miss. Drives the confirm dialog. */
export function hasEdits(doc: WorkspaceDoc | undefined): boolean {
  if (!doc) return false;
  return doc.annotations.length > 0 || doc.imageCrop !== null;
}

// ---------------------------------------------------------------------------
// Persistence — a store file of its own.
//
// `config.json` is rewritten in full on every settings change (see
// settings.ts), and workspace docs are both large and written often. Keeping
// them apart means an annotation stroke never risks the config, and a corrupt
// workspaces file costs workspaces rather than every preference.
// ---------------------------------------------------------------------------

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise)
    storePromise = load(WORKSPACE_STORE_FILE, { autoSave: false, defaults: {} });
  return storePromise;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 800;

function schedulePersist() {
  if (!isTauriRuntime()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistNow();
  }, SAVE_DEBOUNCE_MS);
}

async function persistNow() {
  if (!isTauriRuntime()) return;
  const { order, activeId, docs, barPref, barPrefUserSet } = useWorkspaces.getState();
  // Blob-backed docs cannot survive a restart; never write them out.
  const persistable = order.filter((id) => docs[id]?.image?.kind !== "blob");
  try {
    const store = await getStore();
    await store.set("order", persistable);
    await store.set(
      "activeId",
      activeId && persistable.includes(activeId) ? activeId : (persistable[0] ?? null),
    );
    await store.set(
      "docs",
      Object.fromEntries(persistable.map((id) => [id, docs[id]])),
    );
    await store.set("bar", { pref: barPref, userSet: barPrefUserSet });
    await store.save();
  } catch (e) {
    console.error("workspace persist failed", e);
  }
}

/** Validate one persisted doc, or drop it. A bad entry must not poison the set. */
function reviveDoc(raw: unknown): WorkspaceDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  const image =
    o.image && typeof o.image === "object" &&
    (o.image as Record<string, unknown>).kind === "file" &&
    typeof (o.image as Record<string, unknown>).path === "string"
      ? ({ kind: "file", path: (o.image as Record<string, string>).path } as const)
      : null;
  const crop = o.imageCrop;
  const validCrop =
    crop && typeof crop === "object" &&
    ["x", "y", "w", "h"].every((k) => typeof (crop as Record<string, unknown>)[k] === "number")
      ? (crop as ImageCrop)
      : null;
  return {
    id: o.id,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
    image,
    thumb: typeof o.thumb === "string" ? o.thumb : "",
    sourcePath: typeof o.sourcePath === "string" ? o.sourcePath : undefined,
    annotations: Array.isArray(o.annotations) ? (o.annotations as Annotation[]) : [],
    nextPinNumber: typeof o.nextPinNumber === "number" ? o.nextPinNumber : 1,
    imageCrop: validCrop,
    backdropOn: o.backdropOn === true,
    captureSource:
      typeof o.captureSource === "string"
        ? (o.captureSource as CaptureSource)
        : "other",
    displayScale: typeof o.displayScale === "number" ? o.displayScale : 0,
    userZoomed: o.userZoomed === true,
    scroll:
      o.scroll && typeof o.scroll === "object" &&
      typeof (o.scroll as Record<string, unknown>).left === "number" &&
      typeof (o.scroll as Record<string, unknown>).top === "number"
        ? (o.scroll as { left: number; top: number })
        : { left: 0, top: 0 },
  };
}

/**
 * Render a thumbnail of the live stage.
 *
 * Returns "" whenever the stage cannot be measured — no stage, no export box,
 * or mid-swap — rather than guessing, because a thumbnail taken during a swap
 * would show the previous workspace's image under this workspace's number.
 */
export function renderThumb(maxWidth = 160): string {
  if (useWorkspaces.getState().swapping) return "";
  const stage = getStage();
  const box = getStageExportBox();
  if (!stage || !box || box.w <= 0 || box.h <= 0) return "";
  try {
    // Same geometry as exportRegion() in lib/exportImage.ts, and for the same
    // reason: the stage's offsetX/Y pin the content box to stage-local (0, 0),
    // so the region is (0, 0, w*scale, h*scale) — NOT the box's image-space
    // origin. Passing box.x/box.y here crops the wrong part of the canvas at
    // any zoom other than 100%.
    const scale = stage.scaleX() || 1;
    return stage.toDataURL({
      x: 0,
      y: 0,
      width: box.w * scale,
      height: box.h * scale,
      // Output lands at `maxWidth` px wide: (box.w * scale) * pixelRatio.
      pixelRatio: maxWidth / box.w / scale,
      mimeType: "image/jpeg",
      quality: 0.6,
    });
  } catch (e) {
    // Konva throws on a tainted canvas; a missing thumbnail is survivable.
    console.warn("thumbnail render failed", e);
    return "";
  }
}

export const useWorkspaces = create<State>((set, get) => ({
  ready: false,
  order: [],
  activeId: null,
  docs: {},
  barPref: "full",
  barPrefUserSet: false,
  swapping: false,
  lastClosed: null,

  init: async (enabled) => {
    if (get().ready) return;
    if (!enabled || !isTauriRuntime()) {
      set({ ready: true });
      return;
    }
    try {
      const store = await getStore();
      const rawDocs = (await store.get<Record<string, unknown>>("docs")) ?? {};
      const rawOrder = (await store.get<string[]>("order")) ?? [];
      const bar = await store.get<{ pref?: string; userSet?: boolean }>("bar");
      const docs: Record<string, WorkspaceDoc> = {};
      for (const [id, raw] of Object.entries(rawDocs)) {
        const doc = reviveDoc(raw);
        if (doc) docs[id] = doc;
      }
      const order = rawOrder.filter((id) => docs[id]);
      const storedActive = await store.get<string | null>("activeId");
      set({
        ready: true,
        docs,
        order,
        activeId: storedActive && docs[storedActive] ? storedActive : (order[0] ?? null),
        barPref: bar?.pref === "rail" ? "rail" : "full",
        barPrefUserSet: bar?.userSet === true,
      });
      // Only now is it safe to sweep: with a failed load `order` would be empty
      // and the sweep would delete every workspace image on disk.
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("sweep_workspace_images", { keepIds: order });
      } catch (e) {
        console.warn("workspace image sweep skipped", e);
      }
    } catch (e) {
      // Load failure: run with no workspaces and, crucially, no sweep.
      console.error("workspace store load failed", e);
      set({ ready: true });
    }
  },

  commitActive: () => {
    const { activeId, docs, swapping } = get();
    if (!activeId || !docs[activeId]) return;
    const ed = useEditor.getState();
    const thumb = swapping ? docs[activeId].thumb : renderThumb() || docs[activeId].thumb;
    const el = getScrollContainer();
    const scroll = el
      ? { left: el.scrollLeft, top: el.scrollTop }
      : docs[activeId].scroll;
    historyStacks.set(activeId, { past: ed.past, future: ed.future });
    set({
      docs: {
        ...docs,
        [activeId]: {
          ...docs[activeId],
          ...readEditorDoc(ed),
          scroll,
          thumb,
          updatedAt: Date.now(),
        },
      },
    });
    schedulePersist();
  },

  adoptCapture: async (path, source, mode, max) => {
    // Adopt-once. Two independent paths can deliver the same capture almost
    // simultaneously — the `editor:load-image` event and the startup
    // `editor_current_image` probe — and each one used to mint a workspace.
    const { order, docs } = get();
    if (order.some((wid) => docs[wid]?.sourcePath === path)) return null;
    const id = uid();
    let image: WorkspaceImage = { kind: "file", path };
    if (isTauriRuntime()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        // Copy out of the temp dir: `load_editor_image` deletes the previous
        // temp on the next capture, and the startup sweep clears the rest.
        const durable = await invoke<string>("persist_workspace_image", { path, id });
        image = { kind: "file", path: durable };
      } catch (e) {
        // Fall back to the temp path. The workspace works for this session and
        // simply comes back empty after a restart — better than losing it now.
        console.error("persist_workspace_image failed", e);
      }
    }
    if (mode === "replace" && get().activeId)
      return replaceActive(set, get, image, source, path);
    return addWorkspace(
      set,
      get,
      { image, captureSource: source, id, sourcePath: path },
      max,
    );
  },

  adoptBlob: (url, max) =>
    addWorkspace(set, get, { image: { kind: "blob", url }, captureSource: "other" }, max),

  createEmpty: (max) => addWorkspace(set, get, {}, max),

  setActiveImage: (image) => {
    const { activeId, docs } = get();
    if (!activeId || !docs[activeId]) {
      // First image in the session: seed workspace 1 rather than asking the
      // caller to create one. `max` is irrelevant — there is nothing to evict.
      return addWorkspace(set, get, { image }, Number.MAX_SAFE_INTEGER);
    }
    const prev = docs[activeId];
    void deleteImage(prev);
    set({
      docs: {
        ...docs,
        [activeId]: { ...prev, image, updatedAt: Date.now() },
      },
      swapping: true,
    });
    schedulePersist();
    return activeId;
  },

  switchTo: (id) => {
    const { activeId, docs } = get();
    if (id === activeId || !docs[id]) return;
    get().commitActive();
    set({ activeId: id, swapping: true });
    schedulePersist();
  },

  close: (id) => {
    const { order, docs, activeId } = get();
    const index = order.indexOf(id);
    if (index < 0) return;
    const doc = docs[id];
    const nextOrder = order.filter((x) => x !== id);
    const nextDocs = { ...docs };
    delete nextDocs[id];
    historyStacks.delete(id);
    // Closing the active one: prefer the tile to the left, else the right.
    const nextActive =
      activeId === id ? (nextOrder[index - 1] ?? nextOrder[0] ?? null) : activeId;
    set({
      order: nextOrder,
      docs: nextDocs,
      activeId: nextActive,
      swapping: activeId === id && nextActive !== null,
      lastClosed: { doc, index, at: Date.now() },
    });
    scheduleImageDelete(doc);
    schedulePersist();
  },

  reopenLastClosed: () => {
    const { lastClosed, order, docs } = get();
    if (!lastClosed) return;
    cancelImageDelete(lastClosed.doc.id);
    const nextOrder = order.slice();
    nextOrder.splice(Math.min(lastClosed.index, nextOrder.length), 0, lastClosed.doc.id);
    get().commitActive();
    set({
      order: nextOrder,
      docs: { ...docs, [lastClosed.doc.id]: lastClosed.doc },
      activeId: lastClosed.doc.id,
      swapping: true,
      lastClosed: null,
    });
    schedulePersist();
  },

  clearActive: () => {
    const { activeId, docs } = get();
    if (!activeId || !docs[activeId]) return;
    const prev = docs[activeId];
    // The tile stays — "Clear workspace" empties the canvas, it does not close
    // the workspace (that is the tile's ✕). The backing file has no other
    // owner once the image is dropped, so retire it here.
    void deleteImage(prev);
    historyStacks.delete(activeId);
    set({
      docs: { ...docs, [activeId]: { ...emptyDoc(activeId), createdAt: prev.createdAt } },
    });
    schedulePersist();
  },

  closeOthers: () => {
    const { activeId, order, docs } = get();
    if (!activeId) return;
    for (const id of order) {
      if (id === activeId) continue;
      void deleteImage(docs[id]);
      historyStacks.delete(id);
    }
    set({ order: [activeId], docs: { [activeId]: docs[activeId] }, lastClosed: null });
    schedulePersist();
  },

  collapseToActive: () => {
    get().closeOthers();
  },

  setThumb: (id, thumb) => {
    const { docs } = get();
    if (!docs[id] || !thumb || docs[id].thumb === thumb) return;
    set({ docs: { ...docs, [id]: { ...docs[id], thumb } } });
    schedulePersist();
  },

  setBarPref: (pref, userSet = true) => {
    set({ barPref: pref, barPrefUserSet: get().barPrefUserSet || userSet });
    schedulePersist();
  },

  setSwapping: (v) => set({ swapping: v }),
}));

// ---------------------------------------------------------------------------
// helpers used by the actions above
// ---------------------------------------------------------------------------

type NewDocSeed = Partial<
  Pick<WorkspaceDoc, "image" | "captureSource" | "sourcePath">
> & { id?: string };

/**
 * Append a workspace, evicting the oldest when `max` is reached.
 *
 * Straight FIFO — the leftmost tile goes whether or not it holds edits. That is
 * survivable only because it is undoable (toast, or the bar's "Reopen last
 * closed") and because a user who never wants this can set
 * `workspaces.onCapture: "replace"`, under which nothing is ever evicted.
 */
function addWorkspace(
  set: (partial: Partial<State>) => void,
  get: () => State,
  seed: NewDocSeed,
  max: number,
): string {
  const state = get();
  state.commitActive();
  const { order, docs } = get();
  const id = seed.id ?? uid();
  const doc: WorkspaceDoc = {
    ...emptyDoc(id),
    image: seed.image ?? null,
    captureSource: seed.captureSource ?? "other",
    sourcePath: seed.sourcePath,
  };
  let nextOrder = [...order, id];
  const nextDocs = { ...docs, [id]: doc };
  let lastClosed = state.lastClosed;
  if (nextOrder.length > max) {
    const evicted = nextOrder[0];
    nextOrder = nextOrder.slice(1);
    const evictedDoc = nextDocs[evicted];
    delete nextDocs[evicted];
    historyStacks.delete(evicted);
    lastClosed = { doc: evictedDoc, index: 0, at: Date.now() };
    scheduleImageDelete(evictedDoc);
  }
  set({ order: nextOrder, docs: nextDocs, activeId: id, swapping: true, lastClosed });
  schedulePersist();
  return id;
}

/** Overwrite the active workspace's image, keeping its slot and number. */
function replaceActive(
  set: (partial: Partial<State>) => void,
  get: () => State,
  image: WorkspaceImage,
  source: CaptureSource,
  sourcePath?: string,
): string | null {
  const { activeId, docs } = get();
  if (!activeId || !docs[activeId]) return null;
  const prev = docs[activeId];
  // Keep the old doc whole for Undo, including its still-present image file.
  const snapshot: WorkspaceDoc = { ...prev, ...readEditorDoc(useEditor.getState()) };
  historyStacks.delete(activeId);
  set({
    docs: {
      ...docs,
      [activeId]: {
        ...emptyDoc(activeId),
        createdAt: prev.createdAt,
        image,
        captureSource: source,
        sourcePath,
      },
    },
    swapping: true,
    lastClosed: { doc: snapshot, index: get().order.indexOf(activeId), at: Date.now() },
  });
  scheduleImageDelete(snapshot);
  schedulePersist();
  return activeId;
}

/**
 * Undo window. Deleting an evicted workspace's file immediately would make the
 * Undo action a lie — it would restore a document pointing at nothing.
 */
export const UNDO_WINDOW_MS = 6000;
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleImageDelete(doc: WorkspaceDoc | undefined) {
  if (!doc) return;
  cancelImageDelete(doc.id);
  pendingDeletes.set(
    doc.id,
    setTimeout(() => {
      pendingDeletes.delete(doc.id);
      void deleteImage(doc);
    }, UNDO_WINDOW_MS),
  );
}

function cancelImageDelete(id: string) {
  const t = pendingDeletes.get(id);
  if (t) {
    clearTimeout(t);
    pendingDeletes.delete(id);
  }
}

async function deleteImage(doc: WorkspaceDoc | undefined) {
  const image = doc?.image;
  if (!image) return;
  if (image.kind === "blob") {
    // Web: the Blob stays alive for as long as its URL does.
    URL.revokeObjectURL(image.url);
    return;
  }
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_workspace_image", { path: image.path });
  } catch (e) {
    // An orphan file costs disk and is cleaned by the next startup sweep.
    console.warn("delete_workspace_image failed", e);
  }
}

/** Restore this workspace's session undo stacks, if it has any. */
export function restoreHistory(id: string) {
  const stacks = historyStacks.get(id);
  if (!stacks) return;
  useEditor.setState({ past: stacks.past as never, future: stacks.future as never });
}

/** Effective bar height mode: one workspace means the bar isn't there at all. */
export function barModeFor(order: string[], pref: Exclude<BarMode, "hidden">): BarMode {
  return order.length <= 1 ? "hidden" : pref;
}

/** Restore a workspace's scroll offset once its bitmap has actually decoded. */
export function restoreScroll(scroll: { left: number; top: number } | undefined) {
  if (!scroll) return;
  const el = getScrollContainer();
  if (!el) return;
  el.scrollLeft = scroll.left;
  el.scrollTop = scroll.top;
}
