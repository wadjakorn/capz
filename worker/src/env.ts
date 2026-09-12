export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  FEEDBACK_RL: RateLimiter;
  GITHUB_REPO: string;
  ISSUE_CREATION_ENABLED: string;
  DAILY_ISSUE_CAP: string;
  PER_IP_DAILY_CAP: string;
  UPSTREAM_LATEST: string;
  // secrets (wrangler secret put)
  GITHUB_PAT: string;
  ID_SALT: string;
  STATS_TOKEN: string;
}

/** YYYY-MM-DD in UTC. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function intVar(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
