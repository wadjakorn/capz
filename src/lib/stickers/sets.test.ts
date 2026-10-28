import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { DEFAULT_CONFIG, type AppConfig } from "@/lib/config";
import { BUILTIN_STICKER_SETS, BUILTIN_STICKER_SET_IDS } from "./builtin";
import {
  canDisableSet,
  findStickerItem,
  moveSetId,
  orderedSetIds,
  visibleStickerSets,
} from "./sets";

type Cfg = AppConfig["stickers"];
const cfg = (p: Partial<Cfg> = {}): Cfg => ({ ...DEFAULT_CONFIG.stickers, ...p });
const folder = (id: string, enabled = true) => ({ id, dir: `/x/${id}`, name: id, enabled });

describe("built-in sticker sets", () => {
  it("ships every image file it lists", () => {
    for (const set of BUILTIN_STICKER_SETS) {
      for (const item of set.items) {
        if (item.kind !== "image") continue;
        expect(existsSync(new URL(`../../../public${item.src}`, import.meta.url)), item.src).toBe(true);
      }
    }
  });

  it("has unique set ids and unique item ids within a set", () => {
    expect(new Set(BUILTIN_STICKER_SET_IDS).size).toBe(BUILTIN_STICKER_SET_IDS.length);
    for (const set of BUILTIN_STICKER_SETS) {
      expect(new Set(set.items.map((i) => i.id)).size, set.id).toBe(set.items.length);
    }
  });
});

describe("orderedSetIds", () => {
  it("defaults to the built-in order, then folders", () => {
    expect(orderedSetIds(cfg({ folders: [folder("dir:a")] }))).toEqual([...BUILTIN_STICKER_SET_IDS, "dir:a"]);
  });

  it("follows `order`, drops unknown / duplicate ids and appends the rest", () => {
    const ids = orderedSetIds(cfg({ folders: [folder("dir:a")], order: ["dir:a", "gone", "status", "dir:a"] }));
    expect(ids.slice(0, 2)).toEqual(["dir:a", "status"]);
    expect(ids).toHaveLength(BUILTIN_STICKER_SET_IDS.length + 1);
    expect(ids).not.toContain("gone");
  });
});

describe("visibleStickerSets", () => {
  it("hides disabled built-ins and folders", () => {
    const sets = visibleStickerSets(
      cfg({ disabledBuiltins: ["emoji"], folders: [folder("dir:a", false), folder("dir:b")] }),
      {},
    );
    const ids = sets.map((s) => s.id);
    expect(ids).not.toContain("emoji");
    expect(ids).not.toContain("dir:a");
    expect(ids).toContain("dir:b");
  });

  it("leaves folder sets out on the web build", () => {
    const sets = visibleStickerSets(cfg({ folders: [folder("dir:a")] }), {}, false);
    expect(sets.map((s) => s.id)).toEqual(BUILTIN_STICKER_SET_IDS);
  });

  it("falls back to the emoji set rather than an empty picker", () => {
    const sets = visibleStickerSets(cfg({ disabledBuiltins: [...BUILTIN_STICKER_SET_IDS] }), {});
    expect(sets.map((s) => s.id)).toEqual(["emoji"]);
  });

  it("fills folder sets with their loaded items", () => {
    const item = { id: "a.png", kind: "image" as const, src: "data:x", name: "a.png" };
    const sets = visibleStickerSets(cfg({ folders: [folder("dir:a")] }), { "dir:a": [item] });
    expect(findStickerItem(sets, "dir:a", "a.png")).toEqual(item);
    expect(findStickerItem(sets, "status", "bug")).toMatchObject({ src: "/stickers/status/06-bug.webp" });
    expect(findStickerItem(sets, "status", "nope")).toBeUndefined();
  });
});

describe("moveSetId / canDisableSet", () => {
  it("swaps with the neighbour and stops at the ends", () => {
    const [first, second] = BUILTIN_STICKER_SET_IDS;
    expect(moveSetId(cfg(), second, -1).slice(0, 2)).toEqual([second, first]);
    expect(moveSetId(cfg(), first, -1)).toEqual(orderedSetIds(cfg()));
  });

  it("refuses to disable the last enabled set", () => {
    const allButStatus = BUILTIN_STICKER_SET_IDS.filter((id) => id !== "status");
    expect(canDisableSet(cfg({ disabledBuiltins: allButStatus }), "status")).toBe(false);
    expect(canDisableSet(cfg({ disabledBuiltins: allButStatus, folders: [folder("dir:a")] }), "status")).toBe(true);
  });
});
