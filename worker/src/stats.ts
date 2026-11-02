import { DOWNLOADS_DAILY_SQL } from "./downloads";
import { type Env, json, utcDay } from "./env";

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return utcDay(d);
}

export function isAuthorized(request: Request, env: Env): boolean {
  if (!env.STATS_TOKEN) return false;
  const auth = request.headers.get("authorization");
  // Header only: a token in the URL ends up in logs and browser history.
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return bearer === env.STATS_TOKEN;
}

/** GET /stats */
export async function handleStats(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const today = utcDay();
  const yesterday = daysAgo(today, 1);
  const since7 = daysAgo(today, 6);
  const since30 = daysAgo(today, 29);
  const sinceIso7 = `${since7}T00:00:00.000Z`;

  const db = env.DB;
  const [
    dau, dauYesterday, wau, mau, anon, byVersion, byPlatform, daily, fb7, fbPending, downloads,
    anonDaily, anonByVersion, anonByPlatform,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM pings WHERE day = ?1`).bind(today).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM pings WHERE day = ?1`).bind(yesterday).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT id_hash) AS n FROM pings WHERE day >= ?1`).bind(since7).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT id_hash) AS n FROM pings WHERE day >= ?1`).bind(since30).first<{ n: number }>(),
    db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM anon_pings WHERE day = ?1`).bind(today).first<{ n: number }>(),
    db
      .prepare(
        `SELECT version, COUNT(DISTINCT id_hash) AS machines FROM pings WHERE day >= ?1
         GROUP BY version ORDER BY machines DESC`,
      )
      .bind(since30)
      .all<{ version: string; machines: number }>(),
    db
      .prepare(
        `SELECT target, arch, COUNT(DISTINCT id_hash) AS machines FROM pings WHERE day >= ?1
         GROUP BY target, arch ORDER BY machines DESC`,
      )
      .bind(since30)
      .all<{ target: string; arch: string; machines: number }>(),
    db
      .prepare(`SELECT day, COUNT(*) AS dau FROM pings WHERE day >= ?1 GROUP BY day ORDER BY day ASC`)
      .bind(since30)
      .all<{ day: string; dau: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?1`).bind(sinceIso7).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE issue_number IS NULL`).first<{ n: number }>(),
    db
      .prepare(DOWNLOADS_DAILY_SQL)
      .bind(since30)
      .all<{ day: string; tag: string; asset: string; downloads: number }>(),
    // anon_pings counts update checks, not machines: one machine checks several times a day.
    db
      .prepare(`SELECT day, SUM(n) AS checks FROM anon_pings WHERE day >= ?1 GROUP BY day ORDER BY day ASC`)
      .bind(since30)
      .all<{ day: string; checks: number }>(),
    db
      .prepare(
        `SELECT version, SUM(n) AS checks FROM anon_pings WHERE day >= ?1
         GROUP BY version ORDER BY checks DESC`,
      )
      .bind(since30)
      .all<{ version: string; checks: number }>(),
    db
      .prepare(
        `SELECT target, arch, SUM(n) AS checks FROM anon_pings WHERE day >= ?1
         GROUP BY target, arch ORDER BY checks DESC`,
      )
      .bind(since30)
      .all<{ target: string; arch: string; checks: number }>(),
  ]);

  return json({
    today,
    dau: dau?.n ?? 0,
    dau_yesterday: dauYesterday?.n ?? 0,
    wau: wau?.n ?? 0,
    mau: mau?.n ?? 0,
    anon_today: anon?.n ?? 0,
    by_version_30d: byVersion.results,
    by_platform_30d: byPlatform.results,
    daily_30d: daily.results,
    anon_checks_daily_30d: anonDaily.results,
    anon_checks_by_version_30d: anonByVersion.results,
    anon_checks_by_platform_30d: anonByPlatform.results,
    downloads_daily_30d: downloads.results,
    feedback: { last_7d: fb7?.n ?? 0, pending_issue: fbPending?.n ?? 0 },
  });
}
