#!/usr/bin/env bash
# capz-loop stage runner. See .claude/skills/capz-loop/SKILL.md.
#
#   run-stage.sh <intake|build|verify|release> [--propose] [--dry-run] [--foreground]
#
# Called by the scheduler (n8n over SSH). It returns fast:
#   1. load env, refresh the loop clone (global git lock)
#   2. precheck in bash — gh/pm queries only, no LLM. No work → exit 0.
#      Pure label bookkeeping (intake sync) is done right here.
#   3. dispatch the agent detached via systemd-run (unless --foreground),
#      which re-enters this script with --agent to run `claude -p` under a
#      per-stage lock and timeout, logging to ~/.local/state/capz-loop/.
# A failure in step 3 sends a Telegram message.
set -euo pipefail

STAGE="${1:-}"; shift || true
DRY_RUN=0; FOREGROUND=0; PROPOSE=0; AGENT_MODE=0; WORK_FILE=""
while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --foreground) FOREGROUND=1 ;;
    --propose) PROPOSE=1 ;;
    --agent) AGENT_MODE=1; WORK_FILE="$2"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 64 ;;
  esac
  shift
done
case "$STAGE" in intake|build|verify|release) ;; *)
  echo "usage: run-stage.sh <intake|build|verify|release> [--propose] [--dry-run] [--foreground]" >&2
  exit 64 ;;
esac

ENV_FILE="${CAPZ_LOOP_ENV:-$HOME/.config/capz-loop/env}"
CLONE="${CAPZ_LOOP_CLONE:-$HOME/development/capz-loop}"
WT_ROOT="$HOME/development/capz-loop-wt"
STATE="$HOME/.local/state/capz-loop"
LOCKS="${XDG_RUNTIME_DIR:-/tmp}/capz-loop"
INBOX="wadjakorn/capz-inbox"
REPO="wadjakorn/capz"
OWNER="wadjakorn"
mkdir -p "$STATE/$STAGE" "$LOCKS" "$WT_ROOT"

# shellcheck source=/dev/null
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"
: "${GH_TOKEN:?GH_TOKEN (bot PAT) missing — set it in $ENV_FILE}"
: "${PM_TOKEN:?PM_TOKEN (capz-loop user) missing — set it in $ENV_FILE}"
export GH_TOKEN PM_TOKEN
export CAPZ_LOOP_E2E_LOCK="$LOCKS/e2e.lock"
# Playwright ships no Chromium for this Ubuntu; use the system Chrome.
export PLAYWRIGHT_CHANNEL="${PLAYWRIGHT_CHANNEL:-chrome}"

log() { printf '%s [%s] %s\n' "$(date -Is)" "$STAGE" "$*" >&2; }

notify() {
  [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]] || return 0
  curl -sS -m 20 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" >/dev/null || log "telegram notify failed"
}

# ---------------------------------------------------------------- agent mode
if ((AGENT_MODE)); then
  exec 9>"$LOCKS/$STAGE.lock"
  if ! flock -n 9; then log "another $STAGE run holds the lock — skipping"; exit 0; fi
  case "$STAGE" in intake) LIMIT=15m ;; build) LIMIT=3h ;; *) LIMIT=1h ;; esac
  LOG="$STATE/$STAGE/$(date +%Y%m%dT%H%M%S).log"
  PROMPT="You are the capz-loop $STAGE stage. Use the capz-loop skill, then the capz-$(
    case "$STAGE" in intake) echo triage ;; build) echo build-ticket ;; verify) echo verify-pr ;; release) echo release ;; esac
  ) skill, and do exactly what it says for this work (found by the precheck):

$(cat "$WORK_FILE")"
  cd "$CLONE"
  set +e
  timeout --kill-after=2m "$LIMIT" claude -p "$PROMPT" \
    --settings "$CLONE/scripts/loop/settings/$STAGE.json" \
    --permission-mode dontAsk \
    ${CLAUDE_MODEL:+--model "$CLAUDE_MODEL"} >"$LOG" 2>&1
  rc=$?
  set -e
  rm -f "$WORK_FILE"
  if ((rc != 0)); then
    notify "capz-loop $STAGE failed (exit $rc). Log: $LOG"
    log "agent exit $rc — $LOG"
  fi
  exit "$rc"
fi

# ---------------------------------------------------------------- refresh
[[ -d "$CLONE/.git" ]] || { echo "loop clone missing: git clone https://github.com/$REPO $CLONE" >&2; exit 1; }
(
  flock 8
  git -C "$CLONE" fetch --quiet --prune origin
  git -C "$CLONE" checkout --quiet --detach origin/main
) 8>"$LOCKS/git.lock"

BOT="$(gh api user -q .login)"

# ---------------------------------------------------------------- prechecks
# Each prints the work description to stdout; empty output = nothing to do.

# pm wrapper for prechecks: JSON array on stdout, or [] with a logged error
# (e.g. the capz-loop user missing) so a bad answer never looks like work.
pm_list() {
  local out
  out="$(pm "$@" --json 2>/dev/null || true)"
  if jq -e 'type == "array"' >/dev/null 2>&1 <<<"$out"; then
    printf '%s' "$out"
  else
    log "pm $* → $(jq -r '.error? // "bad output"' 2>/dev/null <<<"$out" | head -1)"
    printf '[]'
  fi
}

ticket_of_issue() {  # inbox issue number → ticket key from our marker comment
  gh api "repos/$INBOX/issues/$1/comments" --paginate \
    -q '.[].body | capture("capz-loop:ticket=(?<k>CP-[0-9]+)").k' 2>/dev/null | tail -1
}

precheck_intake() {
  local issues new=()
  issues="$(gh api "repos/$INBOX/issues?state=open&per_page=100" \
    -q '[.[] | select(.pull_request == null) | {n: .number, labels: [.labels[].name]}]')"
  # New: no loop:* label yet (cap 5 per run).
  mapfile -t new < <(jq -r '.[] | select([.labels[] | startswith("loop:")] | any | not) | .n' <<<"$issues" | head -5)
  # Sync owner decisions for triaged issues — deterministic, no LLM.
  local n key t
  for n in $(jq -r '.[] | select(.labels | index("loop:triaged")) | .n' <<<"$issues"); do
    key="$(ticket_of_issue "$n")"; [[ -n "$key" ]] || continue
    t="$(pm task get --id "$key" --include-deleted --json 2>/dev/null || true)"
    # An error object (bad key, server down) must never read as a decision.
    jq -e '.id' >/dev/null 2>&1 <<<"$t" || { log "inbox #$n: cannot read $key"; continue; }
    if [[ "$(jq -r '.deleted_at // empty' <<<"$t")" != "" ]]; then
      log "inbox #$n: $key deleted → rejected"
      ((DRY_RUN)) || {
        gh issue edit "$n" -R "$INBOX" --remove-label loop:triaged --add-label loop:rejected >/dev/null
        gh issue close "$n" -R "$INBOX" --comment "Not planned." >/dev/null
      }
    elif [[ "$(jq -r '.status_key' <<<"$t")" != "backlog" ]]; then
      log "inbox #$n: $key accepted"
      ((DRY_RUN)) || gh issue edit "$n" -R "$INBOX" --remove-label loop:triaged --add-label loop:accepted >/dev/null
    fi
  done
  ((${#new[@]})) && printf 'new: %s\n' "$(printf '#%s ' "${new[@]}")"
  return 0
}

precheck_build() {
  local ready stale
  ready="$(pm_list ready --project capz --assignee capz-loop \
    | jq -r '[.[] | select(.title | startswith("[release]") | not)][0] | select(.) | "ticket: \(.ticket) — \(.title)"')"
  if [[ -n "$ready" ]]; then echo "$ready"; return 0; fi
  # A doing ticket untouched for 2h with no build running = crashed run → recover.
  if flock -n "$LOCKS/build.lock" true; then
    stale="$(pm_list task list --project capz --status doing --assignee capz-loop \
      | jq -r --arg cut "$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S)" \
        '[.[] | select(.title | startswith("[release]") | not) | select(.updated_at < $cut)][0] | select(.) | "recover: \(.id) — \(.title)"')"
    [[ -n "$stale" ]] && echo "$stale"
  fi
  return 0
}

precheck_verify() {
  local prs
  prs="$(gh pr list -R "$REPO" --label capz-loop --state open --limit 50 \
    --json number,title,headRefOid,mergeStateStatus,labels,statusCheckRollup,reviews,comments)"
  jq -r --arg bot "$BOT" --arg owner "$OWNER" '
    .[] | select(.title | startswith("chore(release)") | not)
    | . as $p
    | ([.statusCheckRollup[]? | (.conclusion // .state // "")]) as $c
    | ($c | map(select(. == "FAILURE" or . == "ERROR" or . == "CANCELLED" or . == "TIMED_OUT")) | length > 0) as $failed
    | ($c | map(select(. == "" or . == "PENDING" or . == "IN_PROGRESS" or . == "QUEUED" or . == "EXPECTED")) | length > 0) as $pending
    | ([.comments[] | select(.author.login == $bot)] | last | .createdAt // "") as $lastBot
    | ([.comments[] | select(.author.login != $bot and .createdAt > $lastBot)] | length > 0) as $human
    | ([.comments[] | select(.author.login == $bot) | .body | select(contains("capz-loop:reviewed sha=" + $p.headRefOid))] | length > 0) as $reviewed
    | ([.reviews[] | select(.author.login == $owner and .state == "APPROVED" and .commit.oid == $p.headRefOid)] | length > 0) as $approved
    # Rulesets leave reviewDecision empty, so a code-owner gate shows up only as
    # BLOCKED with green checks (verified on the gate-test PR #101).
    | ((.mergeStateStatus == "BLOCKED") or ([.labels[].name] | index("needs-owner-test") != null)) as $gated
    | ([.comments[] | select(.author.login == $bot) | .body | select(contains("capz-loop:owner-test sha=" + $p.headRefOid))] | length > 0) as $asked
    | if   $failed or $human or ($reviewed | not) then "pr: #\(.number) (\(if $failed then "checks failed" elif $human then "new comment" else "unreviewed head" end))"
      elif $pending then empty
      elif $gated and ($approved | not) and $asked then empty
      else "pr: #\(.number) (ready: \(if $gated and ($approved | not) then "ask owner" else "merge" end))" end
  ' <<<"$prs"
  # PRs the owner merged by hand whose ticket is still `completed`.
  pm_list task list --project capz --status completed --assignee capz-loop \
    | jq -r '.[] | select(.title | startswith("[release]") | not) | .ticket_key' \
    | while read -r key; do
        gh pr list -R "$REPO" --state merged --label capz-loop --search "$key in:title" \
          --json number -q '.[0].number // empty' | sed "s/^/merged: #/;s/$/ ($key)/"
      done
  return 0
}

precheck_release() {
  local rel draft
  rel="$(gh pr list -R "$REPO" --state open --label capz-loop \
    --json number,title,headRefOid,reviews \
    -q '[.[] | select(.title | startswith("chore(release)"))][0] // empty')"
  if [[ -n "$rel" ]]; then
    jq -r --arg owner "$OWNER" '. as $p
      | select([.reviews[] | select(.author.login == $owner and .state == "APPROVED" and .commit.oid == $p.headRefOid)] | length > 0)
      | "ship: #\(.number) \(.title)"' <<<"$rel"
    return 0
  fi
  # A [release] ticket the owner moved back to todo after testing the draft.
  draft="$(pm_list task list --project capz --status todo --assignee capz-loop \
    | jq -r '[.[] | select(.title | startswith("[release]"))][0] | select(.) | "publish: \(.ticket_key) \(.title)"')"
  if [[ -n "$draft" ]]; then echo "$draft"; return 0; fi
  if ((PROPOSE)); then
    pm_list task list --project capz --status tested --assignee capz-loop \
      | jq -r 'map(select(.title | startswith("[release]") | not)) | select(length > 0)
               | "propose: \(length) tested ticket(s): \(map(.ticket_key) | join(", "))"'
  fi
  return 0
}

WORK="$("precheck_$STAGE")"
if [[ -z "$WORK" ]]; then log "no work"; exit 0; fi
log "work: $(tr '\n' ';' <<<"$WORK")"
if ((DRY_RUN)); then
  printf 'DRY RUN — would dispatch %s with settings %s\n%s\n' \
    "$STAGE" "scripts/loop/settings/$STAGE.json" "$WORK"
  exit 0
fi

WORK_FILE="$(mktemp "$STATE/$STAGE/work.XXXXXX")"
printf '%s\n' "$WORK" >"$WORK_FILE"
SELF="$CLONE/scripts/loop/run-stage.sh"
if ((FOREGROUND)); then
  exec "$SELF" "$STAGE" --agent "$WORK_FILE"
fi
systemd-run --user --quiet --collect \
  --unit "capz-loop-$STAGE-$(date +%s)" \
  --setenv=CAPZ_LOOP_ENV="$ENV_FILE" --setenv=PATH="$PATH" --setenv=HOME="$HOME" \
  "$SELF" "$STAGE" --agent "$WORK_FILE"
log "dispatched"
