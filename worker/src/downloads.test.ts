import { describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { fetchReleaseAssets, nextPageUrl, parseReleaseAssets, recordDownloadSnapshot } from "./downloads";

const release = (tag: string, assets: [string, number][], draft = false) => ({
  tag_name: tag,
  draft,
  assets: assets.map(([name, download_count]) => ({ name, download_count })),
});

describe("parseReleaseAssets", () => {
  it("flattens releases into one row per asset", () => {
    expect(
      parseReleaseAssets([release("v0.2.0", [["a.dmg", 3], ["b.msi", 0]]), release("v0.1.0", [["a.dmg", 9]])]),
    ).toEqual([
      { tag: "v0.2.0", asset: "a.dmg", count: 3 },
      { tag: "v0.2.0", asset: "b.msi", count: 0 },
      { tag: "v0.1.0", asset: "a.dmg", count: 9 },
    ]);
  });

  it("skips drafts and malformed entries", () => {
    expect(
      parseReleaseAssets([
        release("v9", [["x.dmg", 1]], true),
        { tag_name: 5, assets: [] },
        { tag_name: "v1", assets: [{ name: "ok.exe", download_count: 2 }, { name: "bad", download_count: -1 }, null] },
        null,
      ]),
    ).toEqual([{ tag: "v1", asset: "ok.exe", count: 2 }]);
    expect(parseReleaseAssets({ message: "Bad credentials" })).toEqual([]);
  });
});

describe("nextPageUrl", () => {
  it("reads rel=next from a Link header", () => {
    const link =
      '<https://api.github.com/repositories/1/releases?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/releases?per_page=100&page=3>; rel="last"';
    expect(nextPageUrl(link)).toBe("https://api.github.com/repositories/1/releases?per_page=100&page=2");
    expect(nextPageUrl('<https://x/?page=1>; rel="prev"')).toBeNull();
    expect(nextPageUrl(null)).toBeNull();
  });
});

const env = (db: unknown = {}) =>
  ({ DB: db, GITHUB_PAT: "pat", RELEASES_REPO: "wadjakorn/capz" }) as unknown as Env;

describe("fetchReleaseAssets", () => {
  it("authenticates with the PAT and follows pagination", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([release("v2", [["a", 1]])]), {
          headers: { link: '<https://api.github.com/next>; rel="next"' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([release("v1", [["a", 5]])])));
    const rows = await fetchReleaseAssets(env(), fetchFn);
    expect(rows).toEqual([
      { tag: "v2", asset: "a", count: 1 },
      { tag: "v1", asset: "a", count: 5 },
    ]);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.github.com/repos/wadjakorn/capz/releases?per_page=100");
    expect(fetchFn.mock.calls[0][1].headers.authorization).toBe("Bearer pat");
    expect(fetchFn.mock.calls[1][0]).toBe("https://api.github.com/next");
  });

  it("throws on a non-200 so a bad response never looks like zero downloads", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("rate limited", { status: 403 }));
    await expect(fetchReleaseAssets(env(), fetchFn)).rejects.toThrow("403");
  });
});

describe("recordDownloadSnapshot", () => {
  it("upserts every asset for the UTC day in one batch", async () => {
    const bound: unknown[][] = [];
    const batch = vi.fn(async () => []);
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          bound.push(args);
          return { sql };
        },
      }),
      batch,
    };
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([release("v1", [["a", 4], ["b", 7]])])));
    const n = await recordDownloadSnapshot(env(db), new Date("2026-11-02T03:17:00Z"), fetchFn);
    expect(n).toBe(2);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(bound).toEqual([
      ["2026-11-02", "v1", "a", 4],
      ["2026-11-02", "v1", "b", 7],
    ]);
  });
});
