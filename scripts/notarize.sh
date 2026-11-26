#!/bin/bash
# Notarize + staple a Developer ID signed capz .app or .dmg.
#
# CI: tauri-action already notarizes + staples the .app (it reads the same
# APPLE_API_* env). This script then notarizes the .dmg around it, so the
# outer download passes Gatekeeper on its own too.
# Local: sign with `APPLE_SIGNING_IDENTITY=... pnpm tauri build`, then run this
# on the .app and/or the .dmg (see docs/SIGNING.md).
#
# Usage:
#   scripts/notarize.sh src-tauri/target/aarch64-apple-darwin/release/bundle/macos/capz.app
#   scripts/notarize.sh src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/capz_0.24.0_aarch64.dmg
#
# Credentials (first match wins):
#   1. App Store Connect API key (CI). Same names tauri-bundler reads:
#        APPLE_API_KEY_PATH=/path/AuthKey_XXXX.p8 APPLE_API_KEY=<key id> APPLE_API_ISSUER=<uuid>
#   2. notarytool keychain profile (local). Default name "notary"; override
#      with NOTARY_PROFILE. Create once with:
#        xcrun notarytool store-credentials notary \
#          --apple-id <you@example.com> --team-id <TEAMID> --password <app-specific-pw>
#
# Env:
#   APPLE_SIGNING_IDENTITY  Developer ID identity, used only to sign a .dmg that
#                           is not Developer ID signed yet.
set -euo pipefail

TARGET="${1:-}"
[[ -e "$TARGET" ]] || { echo "usage: $0 <path/to/capz.app | path/to/file.dmg>" >&2; exit 1; }

if [[ -n "${APPLE_API_KEY_PATH:-}" ]]; then
    : "${APPLE_API_KEY:?APPLE_API_KEY (key id) required with APPLE_API_KEY_PATH}"
    : "${APPLE_API_ISSUER:?APPLE_API_ISSUER required with APPLE_API_KEY_PATH}"
    AUTH=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
else
    AUTH=(--keychain-profile "${NOTARY_PROFILE:-notary}")
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Capture first: `cmd | grep -q` under pipefail SIGPIPEs codesign -> false negative.
is_developer_id() {
    local info
    info="$(codesign -dvv "$1" 2>&1 || true)"
    grep -q "^Authority=Developer ID Application" <<<"$info"
}

case "$TARGET" in
    *.app)
        # Notarization rejects anything not Developer ID signed with Hardened
        # Runtime + secure timestamp, so fail fast with a readable message.
        if ! is_developer_id "$TARGET"; then
            echo "error: $TARGET is not Developer ID signed." >&2
            echo "       rebuild: APPLE_SIGNING_IDENTITY=\"Developer ID Application: NAME (TEAMID)\" pnpm tauri build" >&2
            exit 1
        fi
        SUBMIT="$WORK/$(basename "$TARGET" .app).zip"
        # ditto --keepParent preserves the bundle structure and symlinks.
        ditto -c -k --keepParent "$TARGET" "$SUBMIT"
        ;;
    *.dmg)
        if ! is_developer_id "$TARGET"; then
            : "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY (Developer ID Application) required to sign the dmg}"
            codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$TARGET"
        fi
        SUBMIT="$TARGET"
        ;;
    *)
        echo "error: expected .app or .dmg, got $TARGET" >&2
        exit 1
        ;;
esac

echo "Submitting $(basename "$SUBMIT") to Apple notary service (usually 1-5 min)..."
OUT="$WORK/result.json"
xcrun notarytool submit "$SUBMIT" "${AUTH[@]}" --wait --output-format json | tee "$OUT"
echo
STATUS="$(/usr/bin/plutil -extract status raw -o - "$OUT" 2>/dev/null || echo unknown)"
ID="$(/usr/bin/plutil -extract id raw -o - "$OUT" 2>/dev/null || echo "")"

if [[ "$STATUS" != "Accepted" ]]; then
    echo "error: notarization status: $STATUS" >&2
    [[ -n "$ID" ]] && xcrun notarytool log "$ID" "${AUTH[@]}" >&2 || true
    exit 1
fi

xcrun stapler staple "$TARGET"
xcrun stapler validate "$TARGET"

# Final Gatekeeper check, judged the way a downloaded copy would be.
if [[ "$TARGET" == *.app ]]; then
    spctl --assess --type execute --verbose=2 "$TARGET"
else
    spctl --assess --type open --context context:primary-signature --verbose=2 "$TARGET"
fi
echo "Notarized + stapled: $TARGET"
