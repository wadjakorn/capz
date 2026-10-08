---
name: capz-release
description: capz-loop release stage — propose a release PR when merged-but-unreleased tickets exist, and once the owner approves it, merge, tag, wait for the GitHub Actions Build, verify assets, publish the draft (draft=false), and close the inbox issues. Use when run as `run-stage.sh release`, or when asked to cut/publish a capz release.
---

# capz-release (release)

Read `capz-loop` first. The release gate is the owner's approval of the
release PR (it touches `package.json`, a CODEOWNERS path). The prompt says
which phase the precheck found: `propose`, `ship`, or `publish`.

## Phase `propose` — tested tickets, no open release PR

1. Collect tickets in `tested` with assignee `capz-loop` (filter, don't pipe
   a full list): their PRs, titles, source issues.
2. Bump type: any `feat` → `minor`, else `patch`.
3. In a fresh worktree from `origin/main`:
   `node scripts/release.mjs <minor|patch> --no-tag` — commits
   `chore(release): vX.Y.Z` touching `package.json`, `tauri.conf.json`,
   `Cargo.toml`, `Cargo.lock`. Branch `release/vX.Y.Z`, push.
4. `gh pr create --label capz-loop --title "chore(release): vX.Y.Z"` with body:
   changelog (one line per PR, `#N` + CP key), the combined Mac/Windows test
   checklist from those PRs, "Approve this PR to release. Merges are frozen
   while it is open."
5. Create ticket `[release] vX.Y.Z` (assignee `capz-loop`, status backlog,
   priority medium) linking the PR and listing the tickets. If any included
   PR touched Windows-only behaviour, write `Windows: test draft before
   publish` in its Decisions.

## Phase `ship` — release PR approved by wadjakorn on its head SHA

1. If the branch is behind main, stop: comment that the release PR is out of
   date (the freeze should prevent this) and move the ticket to `blocked`.
2. `gh pr merge --squash --delete-branch`. Read the merge commit SHA.
3. `git tag -a vX.Y.Z <merge-sha> -m "capz vX.Y.Z" && git push origin vX.Y.Z`.
   This starts `build.yml` (draft release + `publish-meta`).
4. Wait for the run: `gh run list -R wadjakorn/capz --workflow build.yml
   --branch vX.Y.Z` → `gh run watch <id> --exit-status`. Failure → STATUS with
   the failing job, ticket `blocked`, stop (the draft stays; a re-run reuses it).
5. **Assets:** names of `gh release view vX.Y.Z --json assets` must equal the
   previous release's names with the version swapped (dmg ×2, setup.exe +
   .sig, msi + .sig, app.tar.gz ×2 + .sig, `latest.json`). Missing → blocked.
6. Windows-test flag set → STATUS "draft built — test the installer, then move
   [release] to todo", ticket `blocked`, stop. Otherwise continue to publish.

## Phase `publish` — draft built and cleared to go

1. `gh release edit vX.Y.Z --draft=false --latest --notes-file <notes>` —
   notes = the changelog in plain user language (what changed, not PR jargon).
2. Check `curl -sL https://wadjakorn.github.io/capz/latest.json` → `"version": "X.Y.Z"`.
   `update-cask.yml` runs by itself on `release: published`; confirm it started.
3. Tickets: each included ticket `tested → released`; `[release]` ticket
   walked to `released`.
4. Inbox: for each source issue — comment "Released in vX.Y.Z", label
   `loop:released`, close.
5. Remove the release worktree.

Print: version, run id, asset check, publish URL, issues closed.
