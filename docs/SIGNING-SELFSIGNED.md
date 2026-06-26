# macOS Self-Signed Code Signing (free path)

**Status: wired in (2026-06-25).** CI signs every macOS release with a stable
self-signed identity. **$0, no Apple Developer Program, no notarization.**

This is the free middle ground between ad-hoc (`signingIdentity: "-"`) and the
paid Developer ID + notarization runbook in [SIGNING.md](SIGNING.md).

## What it fixes (and what it does not)

| | ad-hoc (before) | self-signed (now) | Dev ID + notarize ($99/yr) |
|---|---|---|---|
| Screen Recording grant survives auto-update | ❌ dies every update | ✅ **survives** | ✅ survives |
| Gatekeeper "damaged" on direct `.dmg` download | needs `xattr` | still needs `xattr` | silent |
| Homebrew install (strips quarantine) | clean | clean | clean |
| Cost | $0 | **$0** | $99/yr |

The win: a **stable code identity**. Ad-hoc gives a new cdhash per build, so macOS
keys the TCC Screen Recording grant to that hash and it breaks on every update.
A self-signed cert reused across all releases keeps the identity constant → the
grant persists. It does **not** add Apple trust, so the Gatekeeper prompt on
direct download stays — Homebrew (`brew install --cask capz`) already strips
quarantine, so the recommended install path is unaffected.

## One-time transition cost

The first signed release flips identity from "none" (ad-hoc) to the stable
self-signed `Developer ID Application: capz (CAPZ000000)`.
Existing installs lose the Screen Recording grant **once** on that update, then
never again. Mention it in that release's notes.

## How it works

[scripts/setup-signing-cert.sh](../scripts/setup-signing-cert.sh) generates a
self-signed code-signing cert and sets three GitHub Actions secrets:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | base64 of the self-signed `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | random p12 export password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: capz (CAPZ000000)` |

### Two non-obvious cert requirements (both caused the first CI failure)

1. **PKCS#12 must use the legacy SHA-1 MAC.** OpenSSL 3 defaults to a SHA-256
   MAC; Apple's `security import` only verifies SHA-1 and fails with
   `MAC verification failed during PKCS12 import (wrong password?)`. The script
   exports with `openssl pkcs12 -export -legacy -macalg sha1`.
2. **CN must start with an Apple identity prefix and the subject must carry an
   Organizational Unit.** `tauri-macos-sign`'s identity parser
   ([keychain/identity.rs](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-macos-sign/src/keychain/identity.rs))
   only looks for certs named `Developer ID Application:` / `Apple Development:`
   / etc. **and** reads the OU as the team id. A plain `CN=capz Self-Signed`
   (no prefix, no OU) imports but resolves to **no signing identity**. So the
   cert is named `Developer ID Application: capz (CAPZ000000)` with `OU=CAPZ000000`.
   It is still self-signed and untrusted — the Apple-looking name is cosmetic and
   `CAPZ000000` is a placeholder, **not** a real Apple Team ID. `codesign` signs
   fine with an untrusted self-signed identity (verified locally); trust only
   matters for Gatekeeper *verification*, which we don't get either way.

[.github/workflows/build.yml](../.github/workflows/build.yml) passes them to
`tauri-action`. Verified against Tauri source (`dev`):

- `crates/tauri-cli/src/interface/rust.rs` — `APPLE_SIGNING_IDENTITY` env overrides
  the `signingIdentity` in `tauri.conf.json`. Config stays `"-"`, so a local
  `pnpm tauri build` **without** the cert still works (ad-hoc); CI overrides it.
- `crates/tauri-bundler/src/bundle/macos/sign.rs` — when `APPLE_CERTIFICATE` is
  set it imports the cert and signs with its identity (`APPLE_SIGNING_IDENTITY`
  must be a substring of the cert CN — it is).
- `crates/tauri-bundler/src/bundle/macos/app.rs` — notarization runs **only** if
  `APPLE_ID`+`APPLE_PASSWORD`+`APPLE_TEAM_ID` (or the API-key trio) are present.
  They are intentionally absent → "skipping app notarization" → build succeeds.
- `KEYCHAIN_PASSWORD` is **not** needed — Tauri creates an ephemeral keychain
  with a random password (`crates/tauri-macos-sign/src/keychain.rs`).

## Verify after the next release

```bash
# In the built app (or after downloading the .app from the release):
codesign -dv --verbose=4 capz.app
#   Authority=Developer ID Application: capz (CAPZ000000)     ← stable identity, not "adhoc"
codesign --verify --deep --strict capz.app && echo OK
```

CI log of the `Build + release via tauri-action` step should show
`Signing with identity "Developer ID Application: capz (CAPZ000000)"` and
`skipping app notarization`.

## Rotating / regenerating

Self-signed certs are zero-cost. Re-run `scripts/setup-signing-cert.sh` to mint a
new one and overwrite the secrets. Note: changing the identity string resets the
TCC grant once for existing users (same as the first transition). Keep
the CN (incl. team-id placeholder) stable to avoid that.

## Upgrading to the paid path later

When ready to kill the Gatekeeper prompt entirely, follow [SIGNING.md](SIGNING.md):
add the Developer ID cert + `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` secrets.
Those override this self-signed setup with zero workflow changes beyond the new
secrets, then remove the Homebrew `postflight xattr` block.
