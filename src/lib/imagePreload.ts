/**
 * Decoded bitmaps for workspace switching.
 *
 * `use-image` drops to `undefined` the moment its `src` changes and only hands
 * back a bitmap once the new one has loaded, so a plain src swap paints at
 * least one frame with no base image under the incoming workspace's
 * annotations. Decoding first and handing EditorStage the finished element
 * lets the image and its annotations land in the same render.
 *
 * Kept tiny on purpose: a full-screen capture is tens of megabytes decoded,
 * and only the image being switched to (plus a couple just left) is useful.
 */
const MAX_ENTRIES = 3;
const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement>>();

function remember(src: string, img: HTMLImageElement) {
  cache.delete(src);
  cache.set(src, img);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
}

/** A finished bitmap for `src`, if one is cached. Refreshes its recency. */
export function getPreloaded(src: string): HTMLImageElement | undefined {
  const img = cache.get(src);
  if (img) remember(src, img);
  return img;
}

/** Load and decode `src`, sharing work with any load already running for it. */
export function preloadImage(src: string): Promise<HTMLImageElement> {
  const hit = getPreloaded(src);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(src);
  if (running) return running;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    // Must match use-image's request, or the canvas is tainted on export.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // decode() keeps the first paint off the main thread where supported;
      // onload alone already guarantees the bitmap is usable.
      const done = () => resolve(img);
      if (typeof img.decode === "function") img.decode().then(done, done);
      else done();
    };
    img.onerror = () => reject(new Error(`image failed to load: ${src}`));
    img.src = src;
  })
    .then((img) => {
      remember(src, img);
      return img;
    })
    .finally(() => inflight.delete(src));
  inflight.set(src, p);
  return p;
}

/** Test hook. */
export function clearPreloadCache() {
  cache.clear();
  inflight.clear();
}
