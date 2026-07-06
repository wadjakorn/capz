/**
 * Browser-native clipboard/download primitives for the web build. The desktop
 * app uses @tauri-apps/plugin-clipboard-manager and plugin-fs instead — see
 * exportImage.ts for the platform branch.
 */

type ClipboardLike = {
  write: (items: unknown[]) => Promise<void>;
};

type ClipboardItemCtorLike = new (
  types: Record<string, Blob | Promise<Blob>>,
) => unknown;

type CopyDeps = {
  clipboard: ClipboardLike | undefined;
  ClipboardItemCtor: ClipboardItemCtorLike | undefined;
};

function defaultCopyDeps(): CopyDeps {
  return {
    clipboard:
      typeof navigator !== "undefined"
        ? (navigator.clipboard as unknown as ClipboardLike | undefined)
        : undefined,
    ClipboardItemCtor:
      typeof ClipboardItem !== "undefined"
        ? (ClipboardItem as unknown as ClipboardItemCtorLike)
        : undefined,
  };
}

/**
 * Copy a PNG to the system clipboard. The ClipboardItem is constructed
 * synchronously around the *pending* promise: Safari ties clipboard writes to
 * the user activation, and awaiting the blob before calling write() loses
 * that activation and throws NotAllowedError.
 */
export function copyPngToClipboard(
  blob: Promise<Blob>,
  deps: CopyDeps = defaultCopyDeps(),
): Promise<void> {
  const { clipboard, ClipboardItemCtor } = deps;
  if (!clipboard || !ClipboardItemCtor) {
    return Promise.reject(new Error("Clipboard API unavailable"));
  }
  return clipboard.write([new ClipboardItemCtor({ "image/png": blob })]);
}

type DownloadDeps = {
  doc: { createElement: (tag: "a") => HTMLAnchorElement };
  url: {
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
  };
};

/** Trigger a browser download of the blob under the given filename. */
export function downloadPng(
  blob: Blob,
  filename: string,
  deps: DownloadDeps = { doc: document, url: URL },
): void {
  const href = deps.url.createObjectURL(blob);
  try {
    const a = deps.doc.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
  } finally {
    deps.url.revokeObjectURL(href);
  }
}

export type CopyResult =
  | { via: "clipboard" }
  | { via: "download"; filename: string }
  | { via: "none" };

type FallbackDeps = {
  copy?: CopyDeps;
  download?: DownloadDeps;
};

/**
 * Copy a PNG to the clipboard, falling back to a browser download when the
 * clipboard image write is unavailable. This is the Linux path: Firefox (and
 * some Wayland/X11 setups) either don't expose `ClipboardItem` image write or
 * reject it at runtime with NotAllowedError, so `via: "clipboard"` is not
 * guaranteed. Pass `fallback` to download the same PNG instead; pass `null`
 * to skip the fallback and report `via: "none"` (the caller already produced a
 * file, e.g. save-and-copy).
 *
 * The clipboard write is kicked off synchronously (see `copyPngToClipboard`) so
 * the Safari user-activation is preserved; the fallback only runs from the
 * rejection handler, after the activation window has already been used.
 */
export function copyPngWithFallback(
  blob: Promise<Blob>,
  fallback: { blob: Blob; filename: string } | null,
  deps: FallbackDeps = {},
): Promise<CopyResult> {
  return copyPngToClipboard(blob, deps.copy ?? defaultCopyDeps()).then(
    (): CopyResult => ({ via: "clipboard" }),
    (): CopyResult => {
      if (!fallback) return { via: "none" };
      downloadPng(fallback.blob, fallback.filename, deps.download);
      return { via: "download", filename: fallback.filename };
    },
  );
}

type ClipboardItemLike = {
  types: readonly string[];
  getType: (type: string) => Promise<Blob>;
};

type ReadDeps = {
  clipboard: { read: () => Promise<ClipboardItemLike[]> } | undefined;
};

function defaultReadDeps(): ReadDeps {
  return {
    clipboard:
      typeof navigator !== "undefined"
        ? (navigator.clipboard as unknown as ReadDeps["clipboard"])
        : undefined,
  };
}

/**
 * Read the first image off the system clipboard (context-menu Paste on the
 * web build). Returns null when unsupported or no image present; the caller
 * falls back to asking for Ctrl+V (the paste event path).
 */
export async function readClipboardPng(
  deps: ReadDeps = defaultReadDeps(),
): Promise<Blob | null> {
  if (!deps.clipboard?.read) return null;
  try {
    const items = await deps.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) return await item.getType(type);
    }
  } catch {
    // Permission denied or unsupported — caller falls back to Ctrl+V.
  }
  return null;
}

/** Pull the first pasted/dropped image file out of a DataTransferItemList. */
export function extractImageBlob(
  items: DataTransferItemList | undefined,
): File | null {
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}
