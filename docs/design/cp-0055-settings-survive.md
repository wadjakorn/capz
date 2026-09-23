# CP-0055 — Settings survive any version change

## Context

Ticket CP-0055: a user's settings must survive upgrades, downgrades, skipped versions and a schema mismatch. The app must never quietly reset or drop a value the user chose.

Everything below comes from reading the code on this branch. `src/lib/config.ts` and `src/stores/settings.ts` are the same as on `origin/main` (1bd29ad); `git diff` shows no difference.

### How settings load and save today
- **The file:** `config.json` in `app_data_dir()`, with the whole config under the key `"app"` (`src/lib/config.ts:431`, `src-tauri/src/services/config_store.rs`). `CONFIG_SCHEMA_VERSION = 2` (`config.ts:297`). The schema-version scaffold first shipped in v0.5.1 (commit 7450957), and v2 shipped in v0.10.0 (ac0e3f7).
- **Loading:** `useSettings.init()` (`settings.ts:57`) runs `migrateConfig(raw)` then `validateConfig(migrated)`.
  - `migrateConfig` (`config.ts:443`) has no list of per-version steps. It always deletes `general.rememberLastRegion`. If the stored version is newer than this build supports, it only prints a warning (`"loading as-is"`).
  - `validateConfig` (`config.ts:849`) checks each field separately:
    - A valid value is kept.
    - A missing value quietly gets its default.
    - An invalid value gets its default and adds an issue.
    - An unknown key adds an issue and is dropped from the result (`warnUnknownKeys`, `vsec`).
- **Automatic repair (self-heal) on load:** `settings.ts:75-85` writes the validated config back to disk whenever `persistedVersion !== CONFIG_SCHEMA_VERSION` or there are any issues. The *newer-than-supported* case matches `!==` too.
- **Every write sends the whole object:**
  - `update()`, `setLastUsed()` and `reset()` (`settings.ts:111-146`) write the full validated in-memory config, stamped with this build's `schemaVersion`.
  - `reset()` also calls `store.clear()`. That removes other top-level keys in the file, such as `permissions`, which `src/lib/notice.ts` writes.
- **Every window runs `init()`:** `ThemeManager` is mounted in `src/app/layout.tsx:39` and calls `init()`. So the editor, every overlay, the ring and the HUD all run `init()`, and any of them can do the repair write.
- **Rust reads the raw file directly at startup, before any JS migration runs.** It reads these fixed paths:
  - `hotkeys.*` (`shortcuts.rs:138`)
  - `updates.autoCheck` and `updates.checkIntervalHours` (`lib.rs:14`)
  - `general.onboardingCompleted` (`lib.rs:89`)
  - `general.editorWindow.width/height`, `general.alwaysOnTopEditor` and `lastUsed.region.monitorId` (`windows.rs:465-525`)
- **Downgrade paths:** the updater has no downgrade path. `updates.channel` is saved, but nothing in `src/` reads it. A downgrade today can only happen by installing an older `.dmg`/`.msi` by hand.

### Confirmed gaps
1. **Downgrade loses data.** When an older build opens a file written by a newer build, the repair write drops the newer keys. It also replaces any value the older build considers invalid (for example, an enum option added later) with the default. Even without the repair, the first `update()` does the same thing and stamps the older `schemaVersion`. The newer version's settings are gone for good.
2. **No migration list.** Renaming, moving or changing the type of a key makes the user's value fall back to its default, unless someone writes a one-off transform. Nothing forces a migration when `CONFIG_SCHEMA_VERSION` is increased.
3. **No backup.** A migration or repair rewrite replaces the only copy.
4. **No tests with real stored files.** `config.test.ts` tests `validateConfig` rules. `settings.test.ts` only covers the web runtime. Nothing loads a v0/v1/v2 file end-to-end.

**Limit to state in the PR:** this only protects downgrades *to* builds that include this change. v0.13.1 and older will still strip newer keys if a user downgrades to them. Nothing can change that.

## Approach

### 1. Ordered migration steps (`src/lib/config.ts`)
- Add `CONFIG_MIGRATIONS: Record<number, (o: Record<string, unknown>) => Record<string, unknown>>`, keyed by the version it migrates *from*.
  - `0 → 1`: identity. Files saved before v0.5.1 had no `schemaVersion`; validation already fills the gaps.
  - `1 → 2`: identity. This keeps the existing comment's point: v2 only added keys.
- Rewrite `migrateConfig(raw)`:
  1. Read `v`.
  2. If `v > CONFIG_SCHEMA_VERSION`, return the object unchanged and flag it as a **newer-version file** (`{ obj, fromVersion, future: true }`).
  3. Otherwise apply each step from `v` up to `CONFIG_SCHEMA_VERSION - 1` in order.
  4. Keep the always-applied cleanup (`rememberLastRegion`) separate from the versioned steps.
- Deep-clone before changing anything. Today it mutates `raw` in place.
- Add an import-time check (`for v in 0..CONFIG_SCHEMA_VERSION-1` a step must exist) that throws in tests. Increasing the version without adding a step then fails `pnpm test:unit`.

### 2. Keep a newer version's data (`src/stores/settings.ts`)
- Keep a module-level `onDisk: Record<string, unknown>`: the object as read, after migration.
- **Newer-version file** (`v > CONFIG_SCHEMA_VERSION`):
  - Never run the load-time repair write.
  - In memory, use the validated config.
  - `update(section, patch)` and `setLastUsed()` write `deepMerge(onDisk, {[section]: patch})`. Only the fields the user actually changed are written. Unknown keys, values this build can't understand and the newer `schemaVersion` stay as they were.
  - Surface **no** issues (changed during implementation). The only UI for `issues` is the editor toast "N invalid settings ignored" with a **Reset settings** button, which would invite the user to wipe the newer build's settings. A `console.warn` from `migrateConfig` records it instead.
- **Same or older version:** keep today's behaviour. Migrate, validate, and write the repaired config when the version changed or there are issues. Unknown keys in a file at the current version are removed keys from earlier releases, and removing them stops the same warning appearing on every launch. Write a backup first (step 3).
- The `onKeyChange` handler (`settings.ts:103`) also updates `onDisk`, so windows don't overwrite each other's newer-version keys.
- `reset()` stays a deliberate wipe, but keeps `permissions` (read it before `clear()` and write it back). This is a small fix for a real data loss found while reading the code.

### 3. Backup before rewriting (`src/stores/settings.ts`)
- Before any repair or migration write, copy the raw value to a separate store file `config.backup.json` with `tauri-plugin-store` (`store:default` is already granted in `capabilities/default.json`, `editor.json` and `overlay.json`; no new permission).
  - Key: `app@v<fromVersion>`, written only if it doesn't exist yet, so the first snapshot before each upgrade is kept.
  - Plus `lastRewrite` = `{ savedAt, fromVersion, issues, raw }`, overwritten each time.
- Wrap in try/catch like the existing repair write. A failed backup must not block loading. It does skip the rewrite, because nothing is lost by leaving the file as it is.
- Don't add a restore UI in this ticket. The backup is there for support and manual recovery.

### 4. Guardrails for Rust-read keys
- Header comment in `config.ts`, next to `CONFIG_MIGRATIONS`, listing the paths Rust reads (from the list above). It will say: a migration that renames or moves one of these must also update the Rust reader, or Rust must read both the old and the new path. Rust reads the file before JS migrates it on the first launch after an update.
- Add a line to the CLAUDE.md "Cross-Cutting Rules": increasing `CONFIG_SCHEMA_VERSION` requires a migration step, a fixture file and a check of the Rust readers.

### Files
- `src/lib/config.ts`: migration list, new `migrateConfig`, `deepMerge` helper, header comment
- `src/stores/settings.ts`: `onDisk`, newer-version write path, backup, `reset` keeps `permissions`
- `src/lib/config.migrate.test.ts` (new) and `src/stores/settings.desktop.test.ts` (new), reusing the in-memory `tauri-plugin-store` mock from `src/lib/installId.test.ts:4-20`
- `src/lib/__fixtures__/config/{v0,v1,v2}.json` built from the defaults at those tags (`v0.5.1` for v1, the last tag before `v0.10.0` for v1-final, `v0.13.1` for v2; a pre-v0.5.1 tag for v0), plus a synthetic `v99.json`
- `CLAUDE.md`: one rule line

## Verification
- `pnpm test:unit`, with new tests for:
  - v0/v1/v2 fixtures loading with every user value kept, and the migrated file backed up once
  - a v99 fixture: no write on `init()`; `update("output", {fileFormat:"png"})` writes only that field, and unknown keys and a future enum value both round-trip; `schemaVersion` stays 99
  - the migration-list check failing when a step is missing
  - `reset()` keeping `permissions`
  - existing `config.test.ts` and `settings.test.ts` (web) still passing
- `pnpm build` (web export) and `cargo clippy --all-targets -- -D warnings` (no Rust change is expected, but check anyway).
- Manual check on the Mac (`mac-app-build` skill):
  1. Edit `config.json` by hand to `schemaVersion: 99` with an extra key and `general.closeAction: "ask"`.
  2. Launch and change one setting.
  3. Confirm the file still has the extra key, `"ask"` and version 99.
  4. Set `schemaVersion: 1`, relaunch, and confirm `config.backup.json` holds `app@v1`.

## Process (after approval)
- Plan mode blocks non-read-only actions, so the ticket hasn't been moved yet. After approval: `pm task move --id CP-0055 --status todo`, then `--status doing`.
- Create a worktree from fresh `origin/main`: `git worktree add ../capz-settings-survive -b feat/cp-0055-settings-survive origin/main`.
- Copy this plan to `docs/design/cp-0055-settings-survive.md` in the worktree so it can be read over md-server.
