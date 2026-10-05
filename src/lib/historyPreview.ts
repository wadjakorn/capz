/**
 * Large previews for the history overlay.
 *
 * The bytes come from the `read_image_preview` command (the asset scope is
 * closed to the save folder) and are handed to the <img> as a blob: URL, so
 * there is no base64 string to build or parse. A handful are kept so flipping
 * between recent items, or clicking one that was hovered, paints at once.
 */

/** How many previews stay decoded-ready. Each is a few hundred KB of JPEG. */
const CAPACITY = 6;

type Fetcher = (path: string, maxEdge: number) => Promise<ArrayBuffer>;

const defaultFetcher: Fetcher = async (path, maxEdge) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ArrayBuffer>("read_image_preview", { path, maxEdge });
};

export function createPreviewCache(fetcher: Fetcher = defaultFetcher, capacity = CAPACITY) {
  // Insertion order is recency order: a hit is deleted and re-inserted.
  // The value is the in-flight promise, so two quick requests share one read.
  const entries = new Map<string, Promise<string>>();

  const evict = () => {
    while (entries.size > capacity) {
      const [key, oldest] = entries.entries().next().value as [string, Promise<string>];
      entries.delete(key);
      oldest.then((url) => URL.revokeObjectURL(url), () => {});
    }
  };

  function load(path: string, maxEdge: number): Promise<string> {
    // Keyed by size bucket too: a preview fetched for a small window must not
    // be shown stretched after the window grows.
    const key = `${maxEdge}|${path}`;
    const hit = entries.get(key);
    if (hit) {
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    }
    const p = fetcher(path, maxEdge).then((buf) =>
      URL.createObjectURL(new Blob([buf], { type: "image/jpeg" })),
    );
    // A failed read must not stay cached, or the file could never be retried.
    p.catch(() => {
      if (entries.get(key) === p) entries.delete(key);
    });
    entries.set(key, p);
    evict();
    return p;
  }

  return {
    load,
    prefetch(path: string, maxEdge: number) {
      load(path, maxEdge).catch(() => {});
    },
    get size() {
      return entries.size;
    },
  };
}

export const previewCache = createPreviewCache();

/**
 * Longest edge to ask Rust for: the canvas area in device pixels, rounded up
 * to a 512 step so small resizes keep hitting the same cache entries.
 */
export function previewEdgeFor(width: number, height: number, dpr: number): number {
  const px = Math.max(width, height) * (dpr || 1);
  return Math.min(3072, Math.max(512, Math.ceil(px / 512) * 512));
}

/** Current edge for the editor's canvas area. */
export function currentPreviewEdge(): number {
  const el = typeof document !== "undefined" ? document.getElementById("canvas-area") : null;
  const r = el?.getBoundingClientRect();
  return previewEdgeFor(r?.width ?? 1280, r?.height ?? 800, window.devicePixelRatio);
}
