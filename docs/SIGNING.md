# macOS Signing + Notarization

capz macOS releases are signed with a **Developer ID Application** certificate
and **notarized by Apple**, so the `.dmg` and the Homebrew cask open with no
Gatekeeper prompt and no `xattr` step.

Before this, releases were self-signed (see [SIGNING-SELFSIGNED.md](SIGNING-SELFSIGNED.md),
now historical) and users had to clear the quarantine flag by hand.

## How it works

| Piece | Role |
| --- | --- |
| [.github/workflows/build.yml](../.github/workflows/build.yml) | macOS jobs: *Notarization setup* writes the API key and exports `APPLE_API_*`, then `tauri-action` signs + notarizes + staples the `.app`, then *Notarize .dmg* notarizes the dmg and replaces the release asset. |
| [scripts/notarize.sh](../scripts/notarize.sh) | Notarize + staple a signed `.app` or `.dmg` (CI and local). API key or `notarytool` keychain profile. |
| `src-tauri/tauri.conf.json` `bundle.macOS.signingIdentity: "-"` | Local default: ad-hoc. CI overrides it via `APPLE_SIGNING_IDENTITY`. |

Facts checked against Tauri source (`crates/tauri-bundler`, `crates/tauri-macos-sign`):

- Hardened Runtime is on by default (`bundle.macOS.hardenedRuntime`), which
  notarization requires. capz needs **no entitlements**: Screen Recording and
  Accessibility are TCC grants, not entitlements, for a non-sandboxed app; the
  macOS build has no third-party dylibs (OCR uses `tract-onnx`, pure Rust;
  `ort` is Windows-only); WKWebView's JIT runs in WebKit's own process.
- `APPLE_CERTIFICATE` (+ password) is imported into a throwaway keychain.
  `codesign` adds a secure timestamp by default for Developer ID identities.
- Notarization runs only when `APPLE_ID`+`APPLE_PASSWORD`+`APPLE_TEAM_ID` **or**
  `APPLE_API_KEY` (the key **id**) + `APPLE_API_ISSUER` + `APPLE_API_KEY_PATH`
  are set. A set-but-empty variable still counts as set, so the workflow only
  exports them when all secrets exist.
- The bundler notarizes and staples the `.app` before it builds the dmg and the
  updater `.app.tar.gz`, so both contain the stapled app. It signs the dmg but
  does not notarize it — hence the extra step.
- Tag builds **fail** if notarization isn't configured, so an un-notarized
  build can never ship behind docs that promise a clean install.

## GitHub Actions secrets

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | `base64 -i DeveloperID.p12` (Developer ID Application cert **with** private key) |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: NAME (TEAMID)` |
| `APPLE_API_KEY` | contents of `AuthKey_XXXX.p8` (App Store Connect → Users and Access → Integrations → Team Keys, role Developer) |
| `APPLE_API_KEY_ID` | the key ID (`XXXX`) |
| `APPLE_API_ISSUER` | the issuer UUID |

Same names and values as `wadjakorn/capture-studio` (one Apple team, one cert,
one API key). `APPLE_API_KEY` holds the `.p8` **contents**; the workflow maps
`APPLE_API_KEY_ID` to Tauri's `APPLE_API_KEY` env (which Tauri means as the id).

```bash
gh secret set APPLE_CERTIFICATE -R wadjakorn/capz < <(base64 -i DeveloperID.p12)
gh secret set APPLE_CERTIFICATE_PASSWORD -R wadjakorn/capz
gh secret set APPLE_SIGNING_IDENTITY -R wadjakorn/capz --body "Developer ID Application: NAME (TEAMID)"
gh secret set APPLE_API_KEY -R wadjakorn/capz < AuthKey_XXXX.p8
gh secret set APPLE_API_KEY_ID -R wadjakorn/capz --body XXXX
gh secret set APPLE_API_ISSUER -R wadjakorn/capz --body <issuer-uuid>
```

These are **separate** from the Tauri updater key (`TAURI_SIGNING_PRIVATE_KEY`,
see CLAUDE.md "Updater Key"). Losing the Apple cert means making a new one;
losing the updater key strands every install.

## Local signed build

Needs the Developer ID identity in the login keychain and a `notarytool` profile:

```bash
security find-identity -v -p codesigning     # "Developer ID Application: NAME (TEAMID)"
xcrun notarytool store-credentials notary \
  --apple-id <you@example.com> --team-id <TEAMID> --password <app-specific-pw>
```

If the identity is listed only without `-v`, the intermediate CA is missing:
`curl -fsSLO https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer && security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db`.

```bash
T=aarch64-apple-darwin
APPLE_SIGNING_IDENTITY="Developer ID Application: NAME (TEAMID)" \
  pnpm tauri build --target $T --bundles app,dmg \
  -c '{"bundle":{"createUpdaterArtifacts":false}}'
B=src-tauri/target/$T/release/bundle
scripts/notarize.sh $B/macos/capz.app        # notarize + staple the app
scripts/notarize.sh $B/dmg/capz_*_aarch64.dmg   # notarize + staple the dmg
```

The bundler can't use a `notarytool` keychain profile, so this local build
packs the dmg before the app is notarized: the app inside the dmg has no
stapled ticket and Gatekeeper checks it online on first launch (works, just
needs network). To get a fully stapled dmg locally, export the three
`APPLE_API_*` variables before `pnpm tauri build`, as CI does.

## Verify a release

```bash
codesign -dv --verbose=4 /Applications/capz.app 2>&1 | grep -E "Authority|flags"
#   Authority=Developer ID Application: NAME (TEAMID)
#   flags=0x10000(runtime)
xcrun stapler validate capz_X.Y.Z_aarch64.dmg
spctl -a -t open --context context:primary-signature -vv capz_X.Y.Z_aarch64.dmg
#   source=Notarized Developer ID
spctl -a -t exec -vv /Applications/capz.app
#   source=Notarized Developer ID
```

CI log: the tauri-action step prints `Signing with identity "Developer ID
Application: ..."` and a notarization submission; *Notarize .dmg* ends with
`Notarized + stapled`.

## First Developer ID release: permissions reset once

macOS keys Screen Recording and Accessibility grants to the code signature.
Moving from the self-signed identity to Developer ID is a new identity to TCC,
so every user re-grants once after updating (the in-app stale-permission
recovery flow covers it). Later releases keep the grant. Say so in that
release's notes.

## After the first notarized release is verified

- Remove the cask `postflight xattr` block ([packaging/homebrew-cask/capz.rb](../packaging/homebrew-cask/capz.rb)).
- Drop the Gatekeeper/xattr steps from README.md, the site install section
  (`src/components/site/Install.tsx`, `install.mac.*` strings) and PRODUCT.md.

## Troubleshooting

- **Notarization rejected:** `xcrun notarytool log <submission-id> --key ... --key-id ... --issuer ...`
  (or `--keychain-profile notary`). Usual causes: an unsigned nested binary, or
  Hardened Runtime off.
- **`errSecInternalComponent` / identity "not valid":** Developer ID G2
  intermediate missing — the workflow installs it; locally see above.
- **Slow:** notarization is usually 1–5 min, sometimes longer. Check
  https://developer.apple.com/system-status/.
- **Cert expiry:** Developer ID certs last 5 years. Notarized builds keep
  working after expiry (stapled ticket); new builds need a renewed cert.

## Out of scope

- Windows code signing (SignPath Foundation, see README "Code signing policy").
- Mac App Store: sandboxing and Apple-run updates conflict with global
  shortcuts, screen capture APIs and the Tauri updater.
