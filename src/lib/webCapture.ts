/**
 * Pure-web screenshot capture, built on the Screen Capture API
 * (`navigator.mediaDevices.getDisplayMedia`). Desktop uses native `xcap`; this
 * is the browser-only path decided in ticket 1RYeHhhZGSfC (pure-web scope).
 *
 * It produces a PNG Blob that the /paste web editor feeds straight into the
 * shared Konva editor via its `applyBlob` handler — the same entry the paste /
 * drop / file-pick paths use. Output (copy/download of the annotated result)
 * stays in webExport.ts; this module only gets pixels in.
 *
 * Limitations vs desktop (by design, not bugs): a permission picker appears on
 * every capture, there are no global hotkeys, and one source is captured at a
 * time. Region select is done client-side by cropping a full capture.
 *
 * The DOM-touching functions (captureScreen/cropCapture) run only in the
 * browser. The pure helpers (isWebCaptureSupported, mapCaptureError,
 * computeCropRect) are unit-tested under the node test env.
 */

export type CaptureErrorKind = "cancelled" | "unsupported" | "failed";

export class WebCaptureError extends Error {
  readonly kind: CaptureErrorKind;
  constructor(kind: CaptureErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "WebCaptureError";
    this.kind = kind;
  }
}

export interface Capture {
  /** PNG-encoded screenshot. */
  blob: Blob;
  /** Physical pixel dimensions of the captured frame. */
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Feature-detect the Screen Capture API. Needs a secure context (HTTPS/localhost). */
export function isWebCaptureSupported(
  nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined,
): boolean {
  return (
    !!nav?.mediaDevices &&
    typeof nav.mediaDevices.getDisplayMedia === "function"
  );
}

/** Normalise the grab-bag of errors getDisplayMedia can throw into our typed error. */
export function mapCaptureError(err: unknown): WebCaptureError {
  if (err instanceof WebCaptureError) return err;
  const name = (err as { name?: string } | null)?.name;
  // NotAllowedError covers both user-dismissed picker and blocked permission.
  if (name === "NotAllowedError" || name === "AbortError") {
    return new WebCaptureError("cancelled");
  }
  if (name === "NotFoundError" || name === "NotSupportedError") {
    return new WebCaptureError("unsupported");
  }
  const message = err instanceof Error ? err.message : String(err);
  return new WebCaptureError("failed", message);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Map a logical (CSS-pixel) selection onto the capture's physical pixels and
 * clamp it inside the frame. `scale` is the source's physical/CSS ratio
 * (usually its devicePixelRatio); pass 1 when the selection is already in
 * capture pixels. Guards against the classic DPR crop-offset bug.
 */
export function computeCropRect(
  sel: Rect,
  phys: { width: number; height: number },
  scale = 1,
): Rect {
  const x = Math.round(clamp(sel.x * scale, 0, phys.width));
  const y = Math.round(clamp(sel.y * scale, 0, phys.height));
  const width = Math.round(clamp(sel.width * scale, 0, phys.width - x));
  const height = Math.round(clamp(sel.height * scale, 0, phys.height - y));
  return { x, y, width, height };
}

// --- Browser-only from here down -------------------------------------------

async function grabFrame(track: MediaStreamTrack): Promise<ImageBitmap> {
  const IC = (globalThis as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
  if (typeof IC === "function") {
    try {
      return await new IC(track).grabFrame();
    } catch {
      // Firefox lacks ImageCapture; fall through to the <video> path.
    }
  }
  return grabViaVideo(track);
}

async function grabViaVideo(track: MediaStreamTrack): Promise<ImageBitmap> {
  const video = document.createElement("video");
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  await video.play();
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
    });
  }
  const bmp = await createImageBitmap(video);
  video.pause();
  video.srcObject = null;
  return bmp;
}

async function bitmapToPng(
  bmp: ImageBitmap,
): Promise<Capture> {
  const { width, height } = bmp;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new WebCaptureError("failed", "2d context unavailable");
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const blob = await canvasToPng(canvas);
  return { blob, width, height };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new WebCaptureError("failed", "toBlob returned null"))),
      "image/png",
    );
  });
}

type FocusController = {
  setFocusBehavior(behavior: "focus-captured-surface" | "no-focus-change"): void;
};

/**
 * Prompt the user to pick a screen/window/tab and return a PNG capture of it.
 * Stops all tracks before resolving so the browser's "sharing" indicator
 * clears. Throws WebCaptureError (kind "cancelled" when the user dismisses).
 *
 * When a browser tab/window is picked, Chrome would otherwise move focus to
 * the captured surface, kicking the user out of our tab. A CaptureController
 * with setFocusBehavior("no-focus-change") suppresses that — it must be called
 * synchronously after getDisplayMedia resolves, before any await.
 */
export async function captureScreen(): Promise<Capture> {
  if (!isWebCaptureSupported()) throw new WebCaptureError("unsupported");
  const CC = (globalThis as unknown as { CaptureController?: new () => FocusController }).CaptureController;
  const controller = typeof CC === "function" ? new CC() : undefined;
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60 },
      audio: false,
      ...(controller ? { controller } : {}),
    } as DisplayMediaStreamOptions);
    // Keep focus on our tab. Guarded: throws if the surface can't stay unfocused.
    try {
      controller?.setFocusBehavior("no-focus-change");
    } catch {
      /* older Chrome / non-tab surface — focus behaviour is best-effort */
    }
    const track = stream.getVideoTracks()[0];
    if (!track) throw new WebCaptureError("failed", "no video track in stream");
    const bmp = await grabFrame(track);
    return await bitmapToPng(bmp);
  } catch (err) {
    throw mapCaptureError(err);
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

/** Client-side region crop of a full capture (browser has no native area select). */
export async function cropCapture(cap: Capture, sel: Rect, scale = 1): Promise<Capture> {
  const r = computeCropRect(sel, { width: cap.width, height: cap.height }, scale);
  if (r.width <= 0 || r.height <= 0) {
    throw new WebCaptureError("failed", "empty crop selection");
  }
  const src = await createImageBitmap(cap.blob);
  const canvas = document.createElement("canvas");
  canvas.width = r.width;
  canvas.height = r.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new WebCaptureError("failed", "2d context unavailable");
  ctx.drawImage(src, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  src.close?.();
  const blob = await canvasToPng(canvas);
  return { blob, width: r.width, height: r.height };
}
