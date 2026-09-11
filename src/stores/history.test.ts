import { describe, expect, it } from "vitest";

import {
  applyCap,
  visibleItems,
  baseName,
  dirName,
  formatBytes,
  insertItem,
  type HistoryItem,
} from "@/stores/history";

const item = (path: string, savedAt = 0): HistoryItem => ({
  id: path,
  kind: "saved",
  path,
  fileName: baseName(path),
  savedAt,
  bytes: 1024,
  size: { w: 10, h: 10 },
  thumb: "",
});

describe("baseName / dirName", () => {
  it("handles POSIX and Windows separators", () => {
    expect(baseName("/home/u/Pictures/capz/a.png")).toBe("a.png");
    expect(baseName("C:\\Users\\u\\Pictures\\a.png")).toBe("a.png");
    expect(dirName("/home/u/Pictures/a.png")).toBe("/home/u/Pictures");
    expect(dirName("C:\\Users\\u\\a.png")).toBe("C:\\Users\\u");
  });

  it("returns the whole string when there is no separator", () => {
    expect(baseName("a.png")).toBe("a.png");
    expect(dirName("a.png")).toBe("");
  });
});

describe("insertItem", () => {
  it("puts the newest entry first", () => {
    const list = insertItem(insertItem([], item("/a.png"), 10), item("/b.png"), 10);
    expect(list.map((i) => i.path)).toEqual(["/b.png", "/a.png"]);
  });

  it("replaces rather than duplicates when the same path is saved again", () => {
    const first = insertItem([], item("/a.png", 1), 10);
    const again = insertItem(insertItem(first, item("/b.png", 2), 10), item("/a.png", 3), 10);
    expect(again.map((i) => i.path)).toEqual(["/a.png", "/b.png"]);
    expect(again[0].savedAt).toBe(3);
  });

  it("drops the oldest entries once the cap is reached (FIFO)", () => {
    let list: HistoryItem[] = [];
    for (let i = 0; i < 5; i++) list = insertItem(list, item(`/${i}.png`, i), 3);
    expect(list.map((i) => i.path)).toEqual(["/4.png", "/3.png", "/2.png"]);
  });
});

describe("applyCap", () => {
  it("keeps the newest `max` entries", () => {
    const list = [item("/a.png"), item("/b.png"), item("/c.png")];
    expect(applyCap(list, 2).map((i) => i.path)).toEqual(["/a.png", "/b.png"]);
  });

  it("is a no-op when already under the cap", () => {
    const list = [item("/a.png")];
    expect(applyCap(list, 50)).toHaveLength(1);
  });

  it("empties the list for a cap of zero rather than throwing", () => {
    expect(applyCap([item("/a.png")], 0)).toEqual([]);
  });
});

describe("visibleItems", () => {
  const saved = [item("/s1.png", 30), item("/s2.png", 10)];
  const archived = [
    { ...item("/a1.png", 20), kind: "capture" as const },
    { ...item("/a2.png", 40), kind: "capture" as const },
  ];

  it("interleaves both kinds newest-first under 'all'", () => {
    expect(visibleItems(saved, archived, "all").map((i) => i.path)).toEqual([
      "/a2.png", "/s1.png", "/a1.png", "/s2.png",
    ]);
  });

  it("narrows to one kind without reordering", () => {
    expect(visibleItems(saved, archived, "saved").map((i) => i.path)).toEqual([
      "/s1.png", "/s2.png",
    ]);
    expect(visibleItems(saved, archived, "capture").map((i) => i.path)).toEqual([
      "/a2.png", "/a1.png",
    ]);
  });

  // The two failures a user would actually notice.
  it("loses nothing and doubles nothing", () => {
    const all = visibleItems(saved, archived, "all");
    expect(all).toHaveLength(saved.length + archived.length);
    expect(new Set(all.map((i) => i.path)).size).toBe(all.length);
  });

  it("survives either side being empty", () => {
    expect(visibleItems([], archived, "all")).toHaveLength(2);
    expect(visibleItems(saved, [], "all")).toHaveLength(2);
    expect(visibleItems([], [], "all")).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("scales the unit and hides a zero", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
