---
name: capz-verify-pr
description: capz-loop verify stage — review, fix, and merge open capz-loop PRs in wadjakorn/capz once checks are green and any required owner approval is present; then rebase sibling loop PRs, check main still compiles, and move tickets to tested. Use when run as `run-stage.sh verify`, or when asked to shepherd/merge capz-loop PRs.
---

# capz-verify-pr (verify)

Read `capz-loop` first. The prompt lists PRs the precheck flagged (new head
SHA, failed check, new human comment, owner approval, merged by the owner).
Handle them oldest first. You merge as the bot — GitHub enforces the owner's
gates; you never try to get around a "review required".

## Per PR

`gh pr view N -R wadjakorn/capz --json number,title,headRefName,headRefOid,mergeable,mergeStateStatus,reviews,labels,statusCheckRollup,comments,state`

(Don't ask for `reviewRequests` — it needs `read:org`, which the bot token lacks; use
`gh api repos/wadjakorn/capz/pulls/N/requested_reviewers`. `reviewDecision` is always
empty under the ruleset, so don't rely on it.)

Ticket = `CP-NNNN` from the title. Worktree = `~/development/capz-loop-wt/cp<NNNN>`
(re-create from the PR branch if missing).

### A. Merged already (the owner merged it by hand)
Ticket → `tested` (from `completed`), STATUS `- <ISO> verify: merged by owner`,
then cleanup (step F). Not an error.

### B. Review the head SHA
If no comment carries `<!-- capz-loop:reviewed sha=<headRefOid> -->`:
review the diff against the ticket's Proposal/Decisions with the `code-review`
approach (correctness first; no style nits). Post one PR comment with the
findings (or "No blocking findings") ending in that marker.

### C. Fix
- Your findings, failing checks (`gh run view --log-failed`), and every human
  comment newer than your last reply → fix in the worktree using
  `superpowers:receiving-code-review` (verify each claim; push back with
  reasons when a comment is wrong). Rerun the layers from `capz-build-ticket`
  §5 for what you touched. Push. Reply on the PR to each human comment.
- Count fix rounds in STATUS. After **3** rounds still red → STATUS note,
  PR comment explaining what is stuck, ticket → `blocked`. Stop for this PR.
- Pushing dismisses existing approvals — that is intended.

### D. Merge when ALL hold
- `statusCheckRollup` green (incl. `tier 1 — web`), `mergeable` = MERGEABLE.
- Latest review marker = head SHA, no blocking findings open.
- No human comment newer than your last reply.
- **No merge freeze:** no open PR titled `chore(release): v*`.
- **Gate:** if `mergeStateStatus` is `BLOCKED` while checks are green (the
  ruleset wants a code-owner review — `requested_reviewers` lists `wadjakorn`),
  or the PR has the label `needs-owner-test`, there must be an `APPROVED` review by `wadjakorn` whose
  `commit.oid` equals the head SHA. Otherwise ensure the owner was asked:
  one PR comment (once per head SHA, marker
  `<!-- capz-loop:owner-test sha=… -->`) with the checklist of what only a human
  on Mac/Windows can check, the L4 report link, and the L6 `.app` path; build
  the `.app` with the `mac-app-build` skill first (if the Mac is unreachable,
  say so in the comment — never block on it). STATUS "waiting for owner
  test". Then move on.

Then `gh pr merge N -R wadjakorn/capz --squash --delete-branch`.
If GitHub refuses, read why and report it in STATUS; never retry with admin flags.

### E. After a merge
1. Ticket `completed → tested`, STATUS `- <ISO> verify: merged as <sha>`.
2. `cd ~/development/capz-loop && git fetch origin && git checkout --detach origin/main`
   then `cd src-tauri && cargo check` — CI does not build Rust on PRs. A failure → open
   a `fix/` ticket-less PR immediately with the minimal fix and say so on the merged PR.
3. **Rebase sibling loop PRs** (open, label `capz-loop`) that now conflict:
   in each worktree `git rebase origin/main`; conflicts are usually
   independent additions in the same file (store actions, shortcut blocks,
   PROGRESS lines) → keep both sides, then rerun L1 (+ the layers the files
   need) and `git push --force-with-lease`. A conflict that needs a product
   decision → PR comment + ticket `blocked`.

### F. Cleanup (merged PRs)
`git -C ~/development/capz-loop worktree remove --force ~/development/capz-loop-wt/cp<NNNN>`,
delete the local branch, and remove `~/development/_scratch/capz-loop/pr-<N>`.

Print one line per PR: `#N → reviewed|fixed|waiting-owner|merged|blocked`.
