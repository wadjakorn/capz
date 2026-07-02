import { describe, it, expect, vi } from "vitest";
import {
  copyPngToClipboard,
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
