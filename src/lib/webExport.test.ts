import { describe, it, expect, vi } from "vitest";
import {
  copyPngToClipboard,
  copyPngWithFallback,
  downloadPng,
  extractImageBlob,
} from "./webExport";

type FakeItem = { types: Record<string, unknown> };

function makeDeps() {
  const written: FakeItem[] = [];
  class FakeClipboardItem {
    types: Record<string, unknown>;
    constructor(types: Record<string, unknown>) {
      this.types = types;
    }
  }
  const clipboard = {
    write: vi.fn(async (items: unknown[]) => {
      written.push(...(items as FakeItem[]));
    }),
  };
  return {
    clipboard,
    ClipboardItemCtor: FakeClipboardItem as unknown as NonNullable<
      Parameters<typeof copyPngToClipboard>[1]
    >["ClipboardItemCtor"],
    written,
  };
}

describe("copyPngToClipboard", () => {
  it("constructs the ClipboardItem synchronously with the unresolved promise (Safari user-activation pattern)", async () => {
    const deps = makeDeps();
    let resolveBlob!: (b: Blob) => void;
    const blobPromise = new Promise<Blob>((r) => {
      resolveBlob = r;
    });

    const writeDone = copyPngToClipboard(blobPromise, deps);
    // write() must already have been called with an item wrapping the
    // still-pending promise — awaiting the blob first breaks Safari.
    expect(deps.clipboard.write).toHaveBeenCalledTimes(1);
    expect(deps.written[0]?.types["image/png"]).toBe(blobPromise);

    resolveBlob(new Blob(["x"], { type: "image/png" }));
    await expect(writeDone).resolves.toBeUndefined();
  });

  it("propagates clipboard write failure", async () => {
    const deps = makeDeps();
    deps.clipboard.write.mockRejectedValueOnce(new Error("denied"));
    await expect(
      copyPngToClipboard(Promise.resolve(new Blob()), deps),
    ).rejects.toThrow("denied");
  });

  it("rejects when the clipboard API is unavailable", async () => {
    await expect(
      copyPngToClipboard(Promise.resolve(new Blob()), {
        clipboard: undefined,
        ClipboardItemCtor: undefined,
      }),
    ).rejects.toThrow(/clipboard/i);
  });
});

describe("copyPngWithFallback", () => {
  function makeDownloadDeps() {
    const clicked: { href: string; download: string }[] = [];
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(function (this: { href: string; download: string }) {
        clicked.push({ href: this.href, download: this.download });
      }),
    };
    const doc = {
      createElement: vi.fn(() => anchor),
    } as unknown as NonNullable<Parameters<typeof downloadPng>[2]>["doc"];
    const url = {
      createObjectURL: vi.fn(() => "blob:fake-url"),
      revokeObjectURL: vi.fn(),
    };
    return { download: { doc, url }, clicked };
  }

  it("reports via:clipboard and does not download when the write succeeds", async () => {
    const copy = makeDeps();
    const dl = makeDownloadDeps();
    const res = await copyPngWithFallback(
      Promise.resolve(new Blob(["x"], { type: "image/png" })),
      { blob: new Blob(["x"]), filename: "shot.png" },
      { copy, download: dl.download },
    );
    expect(res).toEqual({ via: "clipboard" });
    expect(dl.clicked).toEqual([]);
  });

  it("downloads the fallback PNG and reports via:download when the clipboard is unavailable (Linux/Firefox)", async () => {
    const dl = makeDownloadDeps();
    const res = await copyPngWithFallback(
      Promise.resolve(new Blob(["x"], { type: "image/png" })),
      { blob: new Blob(["x"], { type: "image/png" }), filename: "shot.png" },
      // No clipboard API at all — the Linux Firefox shape.
      { copy: { clipboard: undefined, ClipboardItemCtor: undefined }, download: dl.download },
    );
    expect(res).toEqual({ via: "download", filename: "shot.png" });
    expect(dl.clicked).toEqual([{ href: "blob:fake-url", download: "shot.png" }]);
  });

  it("downloads the fallback when the write rejects at runtime (NotAllowedError)", async () => {
    const copy = makeDeps();
    copy.clipboard.write.mockRejectedValueOnce(new Error("NotAllowedError"));
    const dl = makeDownloadDeps();
    const res = await copyPngWithFallback(
      Promise.resolve(new Blob(["x"], { type: "image/png" })),
      { blob: new Blob(["x"]), filename: "shot.png" },
      { copy, download: dl.download },
    );
    expect(res).toEqual({ via: "download", filename: "shot.png" });
    expect(dl.clicked).toHaveLength(1);
  });

  it("reports via:none without downloading when fallback is null (caller already saved a file)", async () => {
    const dl = makeDownloadDeps();
    const res = await copyPngWithFallback(
      Promise.resolve(new Blob(["x"], { type: "image/png" })),
      null,
      { copy: { clipboard: undefined, ClipboardItemCtor: undefined }, download: dl.download },
    );
    expect(res).toEqual({ via: "none" });
    expect(dl.clicked).toEqual([]);
  });
});

describe("downloadPng", () => {
  it("creates an <a download> pointing at an object URL, clicks it, and revokes the URL", () => {
    const clicked: string[] = [];
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(function (this: { href: string }) {
        clicked.push(this.href);
      }),
    };
    const doc = {
      createElement: vi.fn(() => anchor),
    } as unknown as NonNullable<Parameters<typeof downloadPng>[2]>["doc"];
    const url = {
      createObjectURL: vi.fn(() => "blob:fake-url"),
      revokeObjectURL: vi.fn(),
    };

    downloadPng(new Blob(["x"], { type: "image/png" }), "shot.png", {
      doc,
      url,
    });

    expect(anchor.download).toBe("shot.png");
    expect(clicked).toEqual(["blob:fake-url"]);
    expect(url.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });
});

describe("readClipboardPng", () => {
  it("returns the first image blob from clipboard items", async () => {
    const png = new Blob(["x"], { type: "image/png" });
    const items = [
      { types: ["text/plain"], getType: vi.fn() },
      { types: ["text/html", "image/png"], getType: vi.fn(async () => png) },
    ];
    const { readClipboardPng } = await import("./webExport");
    const got = await readClipboardPng({
      clipboard: { read: async () => items },
    });
    expect(got).toBe(png);
    expect(items[1].getType).toHaveBeenCalledWith("image/png");
  });

  it("returns null when clipboard has no image", async () => {
    const { readClipboardPng } = await import("./webExport");
    const got = await readClipboardPng({
      clipboard: {
        read: async () => [{ types: ["text/plain"], getType: vi.fn() }],
      },
    });
    expect(got).toBeNull();
  });

  it("returns null when the clipboard read API is unavailable", async () => {
    const { readClipboardPng } = await import("./webExport");
    await expect(readClipboardPng({ clipboard: undefined })).resolves.toBeNull();
  });
});

describe("extractImageBlob", () => {
  function item(type: string, file: File | null) {
    return { type, getAsFile: () => file };
  }

  it("returns the first image file from clipboard items", () => {
    const png = new File(["x"], "img.png", { type: "image/png" });
    const items = [
      item("text/plain", null),
      item("image/png", png),
    ] as unknown as DataTransferItemList;
    expect(extractImageBlob(items)).toBe(png);
  });

  it("returns null when no image item exists", () => {
    const items = [
      item("text/plain", null),
      item("text/html", null),
    ] as unknown as DataTransferItemList;
    expect(extractImageBlob(items)).toBeNull();
  });

  it("returns null for empty/undefined item lists", () => {
    expect(extractImageBlob(undefined)).toBeNull();
    expect(
      extractImageBlob([] as unknown as DataTransferItemList),
    ).toBeNull();
  });

  it("skips image items whose getAsFile returns null", () => {
    const png = new File(["x"], "img.png", { type: "image/png" });
    const items = [
      item("image/webp", null),
      item("image/png", png),
    ] as unknown as DataTransferItemList;
    expect(extractImageBlob(items)).toBe(png);
  });
});
