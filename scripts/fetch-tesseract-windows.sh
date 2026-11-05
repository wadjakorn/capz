#!/usr/bin/env bash
# Download the pinned capz Tesseract bundle into src-tauri/vendor/tesseract/.
# Run by CI on Windows before any cargo/tauri build (tauri.windows.conf.json
# bundles that directory). Produced by package-tesseract-windows.sh.
set -euo pipefail

NAME="tesseract-win64-5.4.0.20240606-capz1"
URL="https://github.com/wadjakorn/capz/releases/download/${NAME}/${NAME}.zip"
ASSET_SHA256="a1d613ec6f6d65b384b2264c9e765719dbadd9212e00e892cb6467d911317f9f"

if ! [[ "$ASSET_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ASSET_SHA256 is not pinned — run package-tesseract-windows.sh and pin it" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$repo_root/src-tauri/vendor/tesseract"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL -o "$work/t.zip" "$URL"
echo "$ASSET_SHA256  $work/t.zip" | sha256sum -c --quiet -
# Git Bash on GitHub's Windows runners ships 7z; unzip is not guaranteed.
if command -v unzip >/dev/null; then unzip -q "$work/t.zip" -d "$work"; else 7z x -o"$work" "$work/t.zip" >/dev/null; fi
rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
mv "$work/$NAME" "$dest"
test -f "$dest/tesseract.exe"
test -f "$dest/tessdata/tha.traineddata"
echo "tesseract bundle ready at $dest"
