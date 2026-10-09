import { cloneAnnotation, useEditor, type Annotation, type Tool } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useWorkspaces } from "@/stores/workspaces";
import { annotationAABB, type AABB } from "@/lib/annotationBounds";
import { canDuplicate, duplicateOffset } from "@/lib/duplicate";
import { isTauriRuntime } from "@/lib/platform";
import { getAnnotationNode, getStage, getStageImageSize } from "@/lib/stageBridge";
import { uid } from "@/lib/uid";
import { copyPngWithFallback } from "@/lib/webExport";

/**
 * Copy/paste of a single canvas element (CP-0068). ⌘C with a selection puts a
 * clone here AND a picture of the element on the OS clipboard; ⌘V pastes the
 * clone while the OS clipboard still holds that picture, so copying an image
 * anywhere else afterwards wins. See
 * docs/superpowers/specs/2026-10-09-cp0068-copy-paste-elements-design.md.
 */

/** How far (image px) a paste lands from its anchor in the same workspace. */
export const PASTE_OFFSET = 16;

const GRID = 8;
/** Per-cell tolerance (0..255) — covers OS/browser PNG re-encoding drift. */
const TOLERANCE = 6;

/**
 * Pixel size plus an 8×8 grid of premultiplied RGBA averages. The OS and
 * browsers re-encode clipboard PNGs, so a byte hash never survives the round
 * trip; this does.
 */
export type Fingerprint = { w: number; h: number; cells: number[] };

export type ElementClip = {
  annotation: Annotation;
  /** Workspace the anchor lives in; a paste elsewhere keeps its position. */
  workspaceId: string | null;
  /** Null when the OS clipboard write failed or the element couldn't render. */
  fingerprint: Fingerprint | null;
};

export function fingerprintRgba(data: ArrayLike<number>, w: number, h: number): Fingerprint {
  const sums = new Array<number>(GRID * GRID * 4).fill(0);
  const counts = new Array<number>(GRID * GRID).fill(0);
  for (let y = 0; y < h; y++) {
    const cy = Math.floor((y * GRID) / h);
    for (let x = 0; x < w; x++) {
      const cell = cy * GRID + Math.floor((x * GRID) / w);
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      sums[cell * 4] += (data[i] * a) / 255;
      sums[cell * 4 + 1] += (data[i + 1] * a) / 255;
      sums[cell * 4 + 2] += (data[i + 2] * a) / 255;
      sums[cell * 4 + 3] += a;
      counts[cell] += 1;
    }
  }
  const cells = sums.map((v, k) => {
    const n = counts[Math.floor(k / 4)];
    return n ? Math.round(v / n) : 0;
  });
  return { w, h, cells };
}

export function fingerprintsMatch(a: Fingerprint, b: Fingerprint): boolean {
  if (a.w !== b.w || a.h !== b.h || a.cells.length !== b.cells.length) return false;
  return a.cells.every((v, i) => Math.abs(v - b.cells[i]) <= TOLERANCE);
}

/** Smallest shift that puts `aabb` inside `bounds` (top-left aligned if it can't fit). */
export function clampIntoBounds(
  aabb: AABB | null,
  bounds: { w: number; h: number } | null,
): { dx: number; dy: number } {
  if (!aabb || !bounds) return { dx: 0, dy: 0 };
  const axis = (start: number, size: number, limit: number) => {
    if (size >= limit || start < 0) return -start;
    if (start + size > limit) return limit - size - start;
    return 0;
  };
  return { dx: axis(aabb.x, aabb.w, bounds.w), dy: axis(aabb.y, aabb.h, bounds.h) };
}

export function pasteDelta(
  sameWorkspace: boolean,
  aabb: AABB | null,
  bounds: { w: number; h: number } | null,
): { dx: number; dy: number } {
  return sameWorkspace ? duplicateOffset(aabb, bounds, PASTE_OFFSET) : clampIntoBounds(aabb, bounds);
}

/**
 * Whether ⌘V should paste the copied element rather than the OS clipboard
 * image. `osImage`: "none" = no image on the OS clipboard, null = an image
 * that couldn't be read/fingerprinted, otherwise its fingerprint.
 */
export function shouldPasteElement(
  clip: ElementClip | null,
  s: { tool: Tool; hasImage: boolean },
  osImage: Fingerprint | null | "none",
): boolean {
  if (!clip || !s.hasImage || s.tool === "crop") return false;
  if (osImage === "none") return clip.fingerprint === null;
  if (!osImage || !clip.fingerprint) return false;
  return fingerprintsMatch(clip.fingerprint, osImage);
}

let current: ElementClip | null = null;

export function getElementClipboard(): ElementClip | null {
  return current;
}

export function setElementClipboard(clip: ElementClip | null) {
  current = clip;
}

/** Called by every whole-image copy: the element is no longer the latest copy. */
export function clearElementClipboard() {
  current = null;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const bin = atob(dataUrl.split(",", 2)[1] ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** Write a PNG to the OS clipboard; resolves false instead of throwing. */
function defaultWrite(png: Blob): Promise<boolean> {
  if (!isTauriRuntime()) {
    // Called synchronously from the keydown — Safari needs the user activation.
    return copyPngWithFallback(Promise.resolve(png), null).then((r) => r.via === "clipboard");
  }
  return (async () => {
    const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeImage(new Uint8Array(await png.arrayBuffer()));
    return true;
  })().catch(() => false);
}

/**
 * ⌘C / Ctrl+C with a selection. Returns false (nothing done) when there is no
 * selection or the crop tool is active — the caller then copies the whole
 * image as before.
 */
export async function copySelectedElement(
  deps: { write?: (png: Blob) => Promise<boolean> } = {},
): Promise<boolean> {
  const s = useEditor.getState();
  if (!canDuplicate(s)) return false;
  const src = s.annotations.find((a) => a.id === s.selectedId);
  if (!src) return false;
  const clip: ElementClip = {
    annotation: structuredClone(src),
    workspaceId: useWorkspaces.getState().activeId,
    fingerprint: null,
  };
  current = clip;

  // Everything up to write() stays synchronous (Safari user activation).
  let fingerprint: Fingerprint | null = null;
  let written: Promise<boolean> | null = null;
  try {
    const node = getAnnotationNode(src.id);
    const stage = getStage();
    if (node && stage) {
      const canvas = node.toCanvas({ pixelRatio: 1 / (stage.scaleX() || 1) });
      if (canvas.width > 0 && canvas.height > 0) {
        const px = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
        if (px) fingerprint = fingerprintRgba(px.data, px.width, px.height);
        written = (deps.write ?? defaultWrite)(dataUrlToBlob(canvas.toDataURL("image/png")));
      }
    }
  } catch (err) {
    console.warn("element render failed", err);
  }
  const ok = written ? await written.catch(() => false) : false;
  // A later copy may have replaced us while the write was pending.
  if (ok && current === clip) current = { ...clip, fingerprint };
  return true;
}

/**
 * Paste the copied element: +16 from its anchor in the same workspace, same
 * position (clamped) in another one. Added on top, selected, one undo entry.
 * Returns the new id, or null with nothing copied.
 */
export function pasteElement(): string | null {
  const clip = current;
  if (!clip) return null;
  const s = useEditor.getState();
  const workspaceId = useWorkspaces.getState().activeId;
  const { dx, dy } = pasteDelta(
    workspaceId === clip.workspaceId,
    annotationAABB(clip.annotation),
    getStageImageSize(),
  );
  const copy = cloneAnnotation(clip.annotation, uid(), dx, dy);
  if (copy.type === "pin") copy.number = s.nextPinNumber;
  if (s.tool !== "select") s.setTool("select");
  useEditor.getState().add(copy);
  if (copy.type === "pin") {
    // Same bookkeeping as dropping or duplicating a pin.
    void useSettings.getState().update("pins", { lastUsedNumber: copy.number });
  }
  current = { ...clip, annotation: structuredClone(copy), workspaceId };
  return copy.id;
}

/** Fingerprint an image (data URL or blob) in the browser; null if undecodable. */
export async function fingerprintImage(
  src: string | Blob,
  expect?: { w: number; h: number },
): Promise<Fingerprint | null> {
  try {
    const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
    const bmp = await createImageBitmap(blob);
    try {
      // A size mismatch already decides it — skip reading a big image's pixels.
      if (expect && (bmp.width !== expect.w || bmp.height !== expect.h)) {
        return { w: bmp.width, h: bmp.height, cells: [] };
      }
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, bmp.width, bmp.height);
      return fingerprintRgba(px.data, px.width, px.height);
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

type DesktopPasteDeps = {
  invoke: (cmd: string) => Promise<string>;
  fingerprint: (src: string, expect?: { w: number; h: number }) => Promise<Fingerprint | null>;
  addOverlay: (src: string) => Promise<string | null>;
};

async function defaultDesktopDeps(): Promise<DesktopPasteDeps> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { addOverlayImage } = await import("@/lib/addImage");
  return {
    invoke: (cmd) => invoke<string>(cmd),
    fingerprint: fingerprintImage,
    addOverlay: addOverlayImage,
  };
}

/**
 * Desktop ⌘V and right-click Paste. "base" = empty canvas took the image,
 * "element" = the copied element, "image" = clipboard image layered on top,
 * "failed" = the image couldn't be added. Throws when there's nothing to paste.
 */
export async function desktopPaste(
  deps?: DesktopPasteDeps,
): Promise<"base" | "element" | "image" | "failed"> {
  const d = deps ?? (await defaultDesktopDeps());
  const s = useEditor.getState();
  if (!s.hasImage) {
    await d.invoke("paste_into_editor");
    return "base";
  }
  let dataUrl: string | null = null;
  let readErr: unknown = null;
  try {
    dataUrl = await d.invoke("read_clipboard_image_data_url");
  } catch (err) {
    readErr = err;
  }
  const clip = current;
  if (clip) {
    const os = dataUrl
      ? clip.fingerprint
        ? await d.fingerprint(dataUrl, clip.fingerprint)
        : null
      : "none";
    if (shouldPasteElement(clip, useEditor.getState(), os)) {
      pasteElement();
      return "element";
    }
  }
  if (!dataUrl) throw readErr ?? new Error("clipboard has no image");
  return (await d.addOverlay(dataUrl)) ? "image" : "failed";
}
