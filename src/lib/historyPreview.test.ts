import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPreviewCache, previewEdgeFor } from "@/lib/historyPreview";

let n = 0;
beforeEach(() => {
  n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++n}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const ok = () => vi.fn(async () => new ArrayBuffer(4));

describe("createPreviewCache", () => {
  it("shares one read between concurrent requests for the same file", async () => {
    const fetcher = ok();
    const cache = createPreviewCache(fetcher, 3);
    const [a, b] = await Promise.all([cache.load("/a.png", 1024), cache.load("/a.png", 1024)]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used entry and revokes its URL", async () => {
    const cache = createPreviewCache(ok(), 2);
    const a = await cache.load("/a.png", 1024);
    await cache.load("/b.png", 1024);
    await cache.load("/a.png", 1024); // a is now the most recent
    await cache.load("/c.png", 1024); // evicts b
    await Promise.resolve();
    expect(cache.size).toBe(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(a);
  });

  it("keys by size bucket", async () => {
    const fetcher = ok();
    const cache = createPreviewCache(fetcher, 4);
    await cache.load("/a.png", 1024);
    await cache.load("/a.png", 2048);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed read", async () => {
    const fetcher = vi
      .fn<(p: string, e: number) => Promise<ArrayBuffer>>()
      .mockRejectedValueOnce(new Error("gone"))
      .mockResolvedValueOnce(new ArrayBuffer(4));
    const cache = createPreviewCache(fetcher, 4);
    await expect(cache.load("/a.png", 1024)).rejects.toThrow("gone");
    await expect(cache.load("/a.png", 1024)).resolves.toMatch(/^blob:/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("previewEdgeFor", () => {
  it("rounds device pixels up to a 512 step within bounds", () => {
    expect(previewEdgeFor(860, 600, 2)).toBe(2048);
    expect(previewEdgeFor(200, 100, 1)).toBe(512);
    expect(previewEdgeFor(2000, 1200, 2)).toBe(3072);
  });
});
