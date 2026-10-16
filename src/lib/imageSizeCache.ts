/**
 * Natural image sizes keyed by the exact stage src (`srcForDoc`), never by path
 * or workspace id: a workspace can get a new image under the same id/path, and
 * a src-keyed entry can never describe the wrong bitmap.
 */
type Size = { w: number; h: number };

const IMAGE_SIZE_TIMEOUT_MS = 4000;

const cache = new Map<string, Size>();
const inFlight = new Map<string, Promise<Size>>();

export function getImageSize(src: string): Size | undefined {
  return cache.get(src);
}

function defaultLoad(src: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Must match useImage(src, "anonymous"): a non-CORS cache entry would
    // taint the stage canvas when the user later switches to this workspace.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function loadWithTimeout(src: string, load: (src: string) => Promise<Size>): Promise<Size> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("image size timeout")), IMAGE_SIZE_TIMEOUT_MS);
  });
  return Promise.race([load(src), timeout]).finally(() => clearTimeout(timer));
}

export async function ensureImageSizes(
  srcs: string[],
  load: (src: string) => Promise<Size> = defaultLoad,
): Promise<{ failed: string[] }> {
  const unique = [...new Set(srcs)];
  const results = await Promise.all(
    unique.map(async (src) => {
      if (cache.has(src)) return null;
      let p = inFlight.get(src);
      if (!p) {
        p = loadWithTimeout(src, load)
          .then((size) => {
            cache.set(src, size);
            return size;
          })
          .finally(() => inFlight.delete(src));
        inFlight.set(src, p);
      }
      try {
        await p;
        return null;
      } catch {
        return src;
      }
    }),
  );
  return { failed: results.filter((s): s is string => s !== null) };
}

export function __resetImageSizeCache(): void {
  cache.clear();
  inFlight.clear();
}
