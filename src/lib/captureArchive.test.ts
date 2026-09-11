import { describe, expect, it } from "vitest";

import {
  archiveFileName,
  extOf,
  isArchiveName,
  mbToBytes,
  selectEvictions,
  totalBytes,
  type ArchiveFile,
} from "@/lib/captureArchive";

const MB = 1024 * 1024;
const f = (name: string, mb: number, at: number): ArchiveFile => ({
  path: `/save/Captures/${name}`,
  name,
  bytes: mb * MB,
  at,
});

describe("isArchiveName", () => {
  it("accepts our own files", () => {
    expect(isArchiveName("capz-capture-20260911-143012000.png")).toBe(true);
    expect(isArchiveName("capz-capture-20260911-143012000.jpg")).toBe(true);
  });

  // The guard that keeps eviction away from anything the user put there.
  it("rejects exports and foreign files even inside the folder", () => {
    expect(isArchiveName("capz-20260911-143205.png")).toBe(false);
    expect(isArchiveName("holiday.png")).toBe(false);
    expect(isArchiveName("capz-capture-notes.txt")).toBe(false);
    expect(isArchiveName("capz-capture-")).toBe(false);
  });
});

describe("archiveFileName", () => {
  it("is sortable and carries milliseconds", () => {
    const name = archiveFileName(new Date(2026, 8, 11, 14, 30, 12, 7), "png");
    expect(name).toBe("capz-capture-20260911-143012007.png");
  });

  // A held-down hotkey fires several captures inside one second.
  it("differs for two captures in the same second", () => {
    const a = archiveFileName(new Date(2026, 8, 11, 14, 30, 12, 100), "png");
    const b = archiveFileName(new Date(2026, 8, 11, 14, 30, 12, 900), "png");
    expect(a).not.toBe(b);
  });
});

describe("extOf", () => {
  it("reads the extension and falls back to png", () => {
    expect(extOf("/tmp/capz-temp-1.jpg")).toBe("jpg");
    expect(extOf("/tmp/CAPZ.PNG")).toBe("png");
    expect(extOf("/tmp/noext")).toBe("png");
  });
});

describe("selectEvictions", () => {
  it("keeps everything while under budget", () => {
    const files = [f("a.png", 10, 1), f("b.png", 10, 2)];
    expect(selectEvictions(files, mbToBytes(500))).toEqual([]);
  });

  it("evicts oldest first and stops as soon as it fits", () => {
    const files = [f("a.png", 40, 1), f("b.png", 40, 2), f("c.png", 40, 3)];
    const evicted = selectEvictions(files, mbToBytes(100));
    expect(evicted.map((x) => x.name)).toEqual(["a.png"]);
  });

  it("evicts several when one is not enough", () => {
    const files = [
      f("a.png", 40, 1),
      f("b.png", 40, 2),
      f("c.png", 40, 3),
      f("d.png", 40, 4),
    ];
    const evicted = selectEvictions(files, mbToBytes(100));
    expect(evicted.map((x) => x.name)).toEqual(["a.png", "b.png"]);
  });

  it("ignores list order and goes by timestamp", () => {
    const files = [f("new.png", 40, 9), f("old.png", 40, 1), f("mid.png", 40, 5)];
    const evicted = selectEvictions(files, mbToBytes(100));
    expect(evicted.map((x) => x.name)).toEqual(["old.png"]);
  });

  // Otherwise a tiny budget would delete the capture the user just took, which
  // is the exact opposite of what the feature is for.
  it("never evicts the newest file, even when it alone busts the budget", () => {
    const files = [f("old.png", 10, 1), f("huge.png", 900, 2)];
    const evicted = selectEvictions(files, mbToBytes(250));
    expect(evicted.map((x) => x.name)).toEqual(["old.png"]);
  });

  it("keeps a single oversized file rather than emptying the folder", () => {
    const files = [f("huge.png", 900, 1)];
    expect(selectEvictions(files, mbToBytes(250))).toEqual([]);
  });

  it("handles an empty folder", () => {
    expect(selectEvictions([], mbToBytes(500))).toEqual([]);
  });
});

describe("totalBytes", () => {
  it("sums the folder", () => {
    expect(totalBytes([f("a.png", 1, 1), f("b.png", 2, 2)])).toBe(3 * MB);
    expect(totalBytes([])).toBe(0);
  });
});
