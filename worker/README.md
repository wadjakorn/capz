# capz-api (Cloudflare Worker)

Small backend for two things the desktop app needs:

1. **Anonymous active-install count.** The app's existing update check fetches
   `latest.json` through this Worker instead of straight from GitHub Pages. The
   Worker proxies the signed manifest unchanged and, on the side, counts the
   request. If the user opted in (Settings → Updates → "Share anonymous install
   ID"), the request carries a random UUID header; the Worker stores
   `sha256(uuid + ID_SALT)` once per UTC day. Without the header the request is
   only counted, never identified.
2. **Feedback inbox.** Settings → Feedback posts `{kind, message, version,
   target, arch}` here. Every report is stored in D1 first, then mirrored as an
   issue in the private repo `wadjakorn/capz-inbox`.

Deployed at `https://capz-api.banana3339.workers.dev`. Code lives in this
folder; the Worker is a plain TypeScript module with no framework.

## Routes

| Route | Purpose |
|---|---|
| `GET /latest.json?v=&t=&a=` | Proxy of `https://wadjakorn.github.io/capz/latest.json` (5-min edge cache). Optional header `X-Capz-Install: <uuid v4>`. Counts the check. Returns 502 if upstream fails so the updater falls through to the gh-pages endpoint. |
| `POST /feedback` | JSON body `{ kind: "bug"\|"feature", message (≤4000), version, target, arch }`. 202 on accept, 400 invalid, 413 too large, 429 rate-limited. CORS `*`. |
| `GET /stats` | `Authorization: Bearer <STATS_TOKEN>` or `?token=`. JSON with `dau`, `wau`, `mau`, `anon_today`, `by_version_30d`, `by_platform_30d`, `daily_30d`, `feedback.{last_7d,pending_issue}`. |
| `GET /healthz` | Liveness. |
| cron `17 3 * * *` | Deletes ping rows older than 400 days; retries feedback rows that never became an issue. |

## Data stored

- `pings(day, id_hash, version, target, arch)` — one row per opted-in machine per day. `id_hash` cannot be reversed to the UUID without `ID_SALT`.
- `anon_pings(day, version, target, arch, n)` — counts of checks without an id.
- `feedback(id, created_at, kind, message, version, target, arch, ip_hash, issue_number, issue_error)` — `ip_hash` exists only for the per-IP daily cap.

No IP addresses, hostnames, usernames, or OS versions are stored.

## Abuse controls on `/feedback`

- Cloudflare rate-limit binding: ~2 requests / 60 s per IP (approximate by design).
- D1 cap: `PER_IP_DAILY_CAP` (10) reports per IP per day.
- Global cap: `DAILY_ISSUE_CAP` (50) GitHub issues per day; extra reports stay in D1 with `issue_error = "daily issue cap reached"` and are retried by the cron.
- Kill switch: set `ISSUE_CREATION_ENABLED` to anything but `"true"` and redeploy. Reports keep landing in D1.

## Secrets (Cloudflare only, never in git)

| Name | What |
|---|---|
| `GITHUB_PAT` | Fine-grained PAT, repo `wadjakorn/capz-inbox` only, permission **Issues: Read and write** (+ the mandatory Metadata: Read). Expires yearly — when it does, `/stats.feedback.pending_issue` starts climbing. |
| `ID_SALT` | Random 32 bytes. Rotating it resets all machine identities (DAU continuity breaks). Do not rotate casually. |
| `STATS_TOKEN` | Bearer token for `/stats`. Rotate freely. |

Set or rotate with:

```bash
printf '%s' "$VALUE" | pnpm wrangler secret put NAME --config worker/wrangler.toml
```

## Operating

```bash
pnpm worker:typecheck          # tsc for worker/
pnpm vitest run worker         # unit tests (pure functions)
pnpm worker:dev                # local dev server
pnpm worker:migrate            # apply D1 migrations (remote)
pnpm worker:deploy             # deploy (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)

# read stats
curl -s -H "Authorization: Bearer $STATS_TOKEN" https://capz-api.banana3339.workers.dev/stats | jq

# look at raw rows
pnpm wrangler d1 execute capz-telemetry --remote --config worker/wrangler.toml \
  --command "SELECT day, COUNT(*) FROM pings GROUP BY day ORDER BY day DESC LIMIT 14"
```

CI (`.github/workflows/worker.yml`) runs tests on PRs touching `worker/`, and
migrates + deploys on push to `main`. It needs the repo secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (environment `cloudflare`).

## Adding a migration

Create `worker/migrations/000N_<name>.sql`; `pnpm worker:migrate` applies
anything not yet recorded in the `d1_migrations` table.
