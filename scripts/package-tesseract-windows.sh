#!/usr/bin/env bash
# Repackage UB-Mannheim's Windows Tesseract installer into the minimal,
# debug-stripped bundle capz ships (121 MB raw → ~28 MB). Maintainer tool; run
# on Linux. Needs: curl 7z strip zip sha256sum.
#
# Output: dist/<NAME>.zip and dist/<NAME>.zip.sha256. Upload the zip as a
# GitHub release asset, then pin its hash in fetch-tesseract-windows.sh.
set -euo pipefail

VERSION="5.4.0.20240606"
REV="1"
NAME="tesseract-win64-${VERSION}-capz${REV}"

INSTALLER_URL="https://github.com/UB-Mannheim/tesseract/releases/download/v${VERSION}/tesseract-ocr-w64-setup-${VERSION}.exe"
INSTALLER_SHA256="c885fff6998e0608ba4bb8ab51436e1c6775c2bafc2559a19b423e18678b60c9"

# tesseract-ocr/tessdata_fast — the same data research §8 measured (identical
# to Ubuntu's tesseract-ocr-tha package).
TESSDATA_COMMIT="87416418657359cb625c412a48b6e1d6d41c29bd"
THA_SHA256="294227cc2d1292b0acb28d61d4115c88252b96d466ca90b417cf4cf0c67bf07c"
ENG_SHA256="7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"

# tesseract.exe's transitive DLL closure within the installer, computed by
# walking `objdump -p` imports. System DLLs (KERNEL32, msvcrt, ...) excluded.
DLLS=(
  libtesseract-5.dll libcrypto-3-x64.dll libleptonica-6.dll libstdc++-6.dll
  libzstd.dll libiconv-2.dll libjpeg-8.dll libarchive-13.dll libLerc.dll
  libwebp-7.dll libtiff-6.dll libopenjp2-7.dll libpng16-16.dll libexpat-1.dll
  liblzma-5.dll libgcc_s_seh-1.dll liblz4.dll zlib1.dll libbz2-1.dll
  libdeflate.dll libwebpmux-3.dll libjbig-0.dll libwinpthread-1.dll
  libsharpyuv-0.dll libgif-7.dll libb2-1.dll
)

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_root/dist"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
stage="$work/$NAME"
mkdir -p "$stage/tessdata" "$out_dir"

fetch() { # url dest sha256
  curl -fsSL -o "$2" "$1"
  echo "$3  $2" | sha256sum -c --quiet -
}

fetch "$INSTALLER_URL" "$work/setup.exe" "$INSTALLER_SHA256"
7z x -o"$work/x" "$work/setup.exe" >/dev/null

for f in tesseract.exe "${DLLS[@]}"; do
  cp "$work/x/$f" "$stage/$f"
  # Debug sections only — the executable code is untouched. SignPath allows
  # unsigned upstream OSS binaries inside signed installers; these are never
  # signed with capz's certificate.
  strip --strip-debug "$stage/$f"
done
cp "$work/x/doc/LICENSE" "$stage/LICENSE-tesseract.txt"
cp "$work/x/doc/AUTHORS" "$stage/AUTHORS-tesseract.txt"

base="https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_COMMIT}"
fetch "$base/tha.traineddata" "$stage/tessdata/tha.traineddata" "$THA_SHA256"
fetch "$base/eng.traineddata" "$stage/tessdata/eng.traineddata" "$ENG_SHA256"

rm -f "$out_dir/$NAME.zip"
(cd "$work" && zip -qr -X "$out_dir/$NAME.zip" "$NAME")
(cd "$out_dir" && sha256sum "$NAME.zip" > "$NAME.zip.sha256")
du -h "$out_dir/$NAME.zip"
cat "$out_dir/$NAME.zip.sha256"
