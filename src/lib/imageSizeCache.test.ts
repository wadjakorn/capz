import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetImageSizeCache, ensureImageSizes, getImageSize } from "./imageSizeCache";

beforeEach(() => __resetImageSizeCache());
afterEach(() => vi.useRealTimers());

describe("imageSizeCache", () => {
  it("caches by src", async () => {
    const load = vi.fn(async () => ({ w: 10, h: 20 }));
    expect(getImageSize("a")).toBeUndefined();
    const r = await ensureImageSizes(["a"], load);
    expect(r.failed).toEqual([]);
    expect(getImageSize("a")).toEqual({ w: 10, h: 20 });
  });

  it("only loads missing srcs", async () => {
    const load = vi.fn(async (_s: string) => ({ w: 1, h: 2 }));
    await ensureImageSizes(["a"], load);
    await ensureImageSizes(["a", "b"], load);
    expect(load.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("failures reported and not cached", async () => {
    const load = vi.fn(async (s: string) => {
      if (s === "bad") throw new Error("x");
      return { w: 1, h: 1 };
    });
    const r = await ensureImageSizes(["ok", "bad"], load);
    expect(r.failed).toEqual(["bad"]);
    expect(getImageSize("bad")).toBeUndefined();
    expect(getImageSize("ok")).toEqual({ w: 1, h: 1 });
    await ensureImageSizes(["bad"], load);
    expect(load.mock.calls.filter((c) => c[0] === "bad")).toHaveLength(2);
  });

  it("concurrent calls share one in-flight load", async () => {
    let resolve!: (v: { w: number; h: number }) => void;
    const load = vi.fn(() => new Promise<{ w: number; h: number }>((r) => (resolve = r)));
    const p1 = ensureImageSizes(["a"], load);
    const p2 = ensureImageSizes(["a"], load);
    resolve({ w: 3, h: 4 });
    await Promise.all([p1, p2]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(getImageSize("a")).toEqual({ w: 3, h: 4 });
  });

  it("4 s timeout counts as failure", async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<{ w: number; h: number }>(() => {}));
    const p = ensureImageSizes(["a"], load);
    await vi.advanceTimersByTimeAsync(4000);
    expect((await p).failed).toEqual(["a"]);
    expect(getImageSize("a")).toBeUndefined();
  });
});
