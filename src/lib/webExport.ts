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
