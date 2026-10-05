import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearPreloadCache, getPreloaded, preloadImage } from "@/lib/imagePreload";

/** An Image stand-in that "loads" on the next microtask. */
class FakeImage {
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    queueMicrotask(() => (v.includes("bad") ? this.onerror?.() : this.onload?.()));
  }
}

describe("imagePreload", () => {
  beforeEach(() => {
    clearPreloadCache();
    vi.stubGlobal("Image", FakeImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("caches a loaded image for synchronous lookup", async () => {
    expect(getPreloaded("a")).toBeUndefined();
    const img = await preloadImage("a");
    expect(getPreloaded("a")).toBe(img);
  });

  it("shares one load between concurrent callers", async () => {
    const [x, y] = await Promise.all([preloadImage("a"), preloadImage("a")]);
    expect(x).toBe(y);
  });

  it("keeps only the most recently used few", async () => {
    await preloadImage("a");
    await preloadImage("b");
    await preloadImage("c");
    getPreloaded("a"); // touch: now b is the oldest
    await preloadImage("d");
    expect(getPreloaded("b")).toBeUndefined();
    expect(getPreloaded("a")).toBeDefined();
    expect(getPreloaded("d")).toBeDefined();
  });

  it("rejects a failed load and does not cache it", async () => {
    await expect(preloadImage("bad")).rejects.toThrow();
    expect(getPreloaded("bad")).toBeUndefined();
  });
});
