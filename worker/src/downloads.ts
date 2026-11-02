import { type Env, utcDay } from "./env";

/** Safety stop for pagination; 100 releases per page. */
const MAX_PAGES = 10;

export interface AssetCount {
  tag: string;
  asset: string;
  count: number;
}

/** Turn the GitHub "list releases" JSON into one row per asset. Drafts are skipped. */
export function parseReleaseAssets(releases: unknown): AssetCount[] {
  if (!Array.isArray(releases)) return [];
  const rows: AssetCount[] = [];
  for (const r of releases) {
    if (!r || typeof r !== "object") continue;
    const { tag_name: tag, draft, assets } = r as { tag_name?: unknown; draft?: unknown; assets?: unknown };
    if (draft === true || typeof tag !== "string" || !Array.isArray(assets)) continue;
    for (const a of assets) {
      if (!a || typeof a !== "object") continue;
      const { name, download_count: count } = a as { name?: unknown; download_count?: unknown };
      if (typeof name !== "string" || !Number.isInteger(count) || (count as number) < 0) continue;
      rows.push({ tag, asset: name, count: count as number });
    }
  }
  return rows;
}

/** The rel="next" URL of a GitHub Link header, or null. */
export function nextPageUrl(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

/**
 * All published release assets of `RELEASES_REPO` with their cumulative counts.
 * Authenticated with GITHUB_PAT: unauthenticated calls share Cloudflare's
 * egress IPs and hit GitHub's 60/hour per-IP limit.
 */
export async function fetchReleaseAssets(env: Env, fetchFn: typeof fetch = fetch): Promise<AssetCount[]> {
  const rows: AssetCount[] = [];
  let url: string | null = `https://api.github.com/repos/${env.RELEASES_REPO}/releases?per_page=100`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: Response = await fetchFn(url, {
      headers: {
        authorization: `Bearer ${env.GITHUB_PAT}`,
        accept: "application/vnd.github+json",
        "user-agent": "capz-api",
      },
    });
    if (!res.ok) throw new Error(`GitHub releases ${res.status}`);
    rows.push(...parseReleaseAssets(await res.json()));
    url = nextPageUrl(res.headers.get("link"));
  }
  return rows;
}

/** Cron: store today's cumulative count for every asset. Re-running the same day overwrites. */
export async function recordDownloadSnapshot(
  env: Env,
  now: Date = new Date(),
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const rows = await fetchReleaseAssets(env, fetchFn);
  if (rows.length === 0) return 0;
  const day = utcDay(now);
  const stmt = env.DB.prepare(
    `INSERT INTO download_snapshots (day, tag, asset, count) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(day, tag, asset) DO UPDATE SET count = excluded.count`,
  );
  await env.DB.batch(rows.map((r) => stmt.bind(day, r.tag, r.asset, r.count)));
  return rows.length;
}

/**
 * Downloads per (day, tag, asset) since `?1`: today's cumulative count minus the
 * previous snapshot. An asset seen for the first time counts from zero (new
 * releases start at 0), except on the very first snapshot day, which is only a
 * baseline. A missed cron day folds two days into the next snapshot.
 */
export const DOWNLOADS_DAILY_SQL = `
  WITH s AS (
    SELECT day, tag, asset, count,
           LAG(count) OVER (PARTITION BY tag, asset ORDER BY day) AS prev
    FROM download_snapshots
  )
  SELECT day, tag, asset, count - COALESCE(prev, 0) AS downloads
  FROM s
  WHERE day >= ?1
    AND day > (SELECT MIN(day) FROM download_snapshots)
    AND count - COALESCE(prev, 0) > 0
  ORDER BY day ASC, tag DESC, asset ASC`;
