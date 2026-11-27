# Homebrew Cask — capz

Homebrew distribution for capz on macOS. Releases are Developer ID signed and notarized ([docs/SIGNING.md](../../docs/SIGNING.md)), so the cask is a plain `app` install with no quarantine workaround. CI renders and pushes it on every published release (`.github/workflows/update-cask.yml`).

## How it works

1. CI (or local) runs `pnpm tauri build` → produces `capz_<version>_aarch64.dmg` + `capz_<version>_x64.dmg`.
2. GitHub Release `v<version>` is published with both DMGs attached.
3. `update-cask.yml` fills in version + both SHA256s and pushes `Casks/capz.rb` to the tap.

## Releasing

```bash
# 1. Bump version in package.json + src-tauri/tauri.conf.json + Cargo.toml
# 2. Build both arches (use universal2 target if available, or build twice on each arch)
pnpm tauri build --target aarch64-apple-darwin
pnpm tauri build --target x86_64-apple-darwin

# 3. Compute SHA256
shasum -a 256 src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/capz_*_aarch64.dmg
shasum -a 256 src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/capz_*_x64.dmg

# 4. Update version + sha256 in capz.rb
# 5. Tag + push, then attach DMGs to the GitHub Release

git tag v0.1.0 && git push --tags
gh release create v0.1.0 \
  src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/capz_*_aarch64.dmg \
  src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/capz_*_x64.dmg \
  --title "capz 0.1.0" --notes "First public release."
```

## Distribution channel

Two options:

**A. Personal tap (fast, recommended for v0.x):**

```bash
# One-time per machine:
brew tap wadjakorn/capz https://github.com/wadjakorn/homebrew-capz
# Or commit this cask to a `homebrew-capz` repo, then:
brew install --cask wadjakorn/capz/capz
```

Create repo `wadjakorn/homebrew-capz`, put this `capz.rb` at `Casks/capz.rb`. Done.

**B. Official `homebrew-cask` (requires PR review):**

Fork `Homebrew/homebrew-cask`, drop `capz.rb` under `Casks/c/capz.rb`, open PR. Reviewers require:
- Stable download URL (GitHub release ✓)
- 30-day project age + 75 stars OR `livecheck` passing
- Bundle ID matches (`dev.baze.capz`)
- Signed + notarized app ✓
