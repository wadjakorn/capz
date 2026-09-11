import { describe, expect, it } from "vitest";

import {
  applyCap,
  baseName,
  dirName,
  formatBytes,
  insertItem,
  type HistoryItem,
} from "@/stores/history";

const item = (path: string, savedAt = 0): HistoryItem => ({
  id: path,
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

describe("formatBytes", () => {
  it("scales the unit and hides a zero", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
