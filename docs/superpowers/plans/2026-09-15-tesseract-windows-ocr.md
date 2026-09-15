# Tesseract Windows OCR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทน `Windows.Media.Ocr` ด้วย Tesseract ที่ bundle มากับ `.msi` เพื่อให้ capz บน Windows อ่านภาษาไทยได้

**Architecture:** backend ใหม่ `TesseractBackend` implement trait `OcrBackend` ที่มีอยู่แล้ว เรียก `tesseract.exe` เป็น subprocess ครั้งเดียวต่อภาพโดยให้ออกทั้ง `txt` (ข้อความพร้อมการเว้นวรรคที่ถูกต้อง) และ `tsv` (เรขาคณิต) แล้วประกอบเป็น `OcrLine` ไฟล์ Tesseract ถูก repackage (ตัดเฉพาะ DLL ที่ต้องใช้ + strip debug) เป็น release asset ของ capz เอง CI ดาวน์โหลดและตรวจ SHA-256 ก่อน build โค้ด backend compile ทุกแพลตฟอร์ม เพื่อให้ parser และเทสต์กับ engine จริงรันบน Linux ได้

**Tech Stack:** Rust (Tauri v2.11), `image` 0.25, `anyhow`, Tesseract 5.4.0 (UB-Mannheim build) + `tessdata_fast`, GitHub Actions (`windows-latest`), bash

**Spec:** `docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md`

## Global Constraints

- เฉพาะ Windows — **ห้ามแตะ** `src-tauri/src/services/ocr/macos.rs`
- **ห้ามแตะ** `run_detect`, `pick_languages`, `OcrBox`/`OcrWord`/`OcrLine`/`OcrResult` และ TypeScript IPC types (`src/lib/ocr.ts`)
- เรียก Tesseract เป็น subprocess เท่านั้น — ห้ามเพิ่ม `leptess` หรือ native build dependency ใด ๆ
- Tesseract args คงที่: `-l <langs> --psm 6 --tessdata-dir <dir> txt tsv`, ภาษาไทยมาก่อน (`tha+eng`)
- upscale: `factor = clamp(4000 / long_side, 1.0, 3.0)` — ไม่ downscale
- post-process บังคับ: `U+0E4D U+0E32` → `U+0E33`
- ไม่ invert ภาพ (วัดแล้วไม่ช่วย — research §8)
- ไฟล์ temp ต้องขึ้นต้นด้วย `capz-temp-` (ให้ `image_service::sweep_stale_temp` เก็บกวาดถ้า crash)
- บน Windows ต้องตั้ง `CREATE_NO_WINDOW` (`0x0800_0000`) ตอน spawn
- error ที่ผู้ใช้แก้เองไม่ได้ ห้ามสั่งให้ผู้ใช้ไปตั้งค่าอะไร (บทเรียนจาก #79)
- Tauri: **ห้ามใช้ `localStorage`**; `Cargo.toml` แก้ผ่าน `cargo add/remove` (ยกเว้น target cfg)
- `cargo clippy --all-targets -- -D warnings` ต้องสะอาดทั้งบน Linux และ Windows
- Tesseract 5.4.0.20240606 installer SHA-256: `c885fff6998e0608ba4bb8ab51436e1c6775c2bafc2559a19b423e18678b60c9`
- `tessdata_fast` commit `87416418657359cb625c412a48b6e1d6d41c29bd` — `tha` `294227cc2d1292b0acb28d61d4115c88252b96d466ca90b417cf4cf0c67bf07c`, `eng` `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- Conventional commits, ท้าย commit message ทุกอันมี attribution ตาม session

---

## ข้อเท็จจริงที่วัดมาแล้ว (15 ก.ย. 2026) — อ่านก่อนเริ่ม

1. **ขนาดจริงมากกว่าที่ spec ประเมินไว้เกินเท่าตัว** spec §3 เขียน ~11 MB แต่ build ของ UB-Mannheim เป็น MinGW ที่ลาก DLL มา 26 ตัว: ดิบ 121 MB (`libtesseract-5.dll` ตัวเดียว 101 MB เพราะมี debug symbols) → **หลัง `strip --strip-debug` เหลือ 22.7 MB** + traineddata 5.2 MB = **~28 MB** ต่อการอัปเดตหนึ่งครั้ง
2. **Thai ไม่มีช่องว่าง Tesseract จึงคืน "word" ใน TSV เป็นอักษรทีละกลุ่ม** (`ที่`, `แก้`, ...) การต่อ word ด้วยกฎระยะห่างล้มเหลว (ทดลองแล้ว) วิธีที่ใช้: ออก `txt` + `tsv` ในรอบเดียว ข้อความเอาจาก `txt` เรขาคณิตจาก `tsv` แล้วตรวจว่า `txt` บรรทัดนั้นเมื่อตัดช่องว่างทิ้งเท่ากับ word ใน `tsv` ต่อกัน — ผ่านทั้ง 2 ภาพทดสอบ ถ้าไม่ตรงให้ต่อ word ด้วยช่องว่างแทน
3. **frontend ไม่ได้ใช้ `OcrLine.words` เลย** (`grep "\.words" src` ไม่เจอ) word ระดับตัวอักษรจึงไม่กระทบ UI
4. **`tha.traineddata` ของ Ubuntu = `tessdata_fast` เป๊ะ** (SHA ตรงกัน) ผลวัด §8 จึงใช้แทนสิ่งที่จะ ship ได้
5. **การ publish GitHub Release จะยิง `update-cask.yml`** (`on: release: published`) ต้องใส่ guard ก่อนอัปโหลด asset ไม่งั้น Homebrew cask จะพัง
6. **UB-Mannheim ship แค่ LICENSE ของ Tesseract** ไม่มี license ของ DLL ภายนอก (OpenSSL, libarchive, libstdc++ ฯลฯ) — ดู Task 8
7. **(เพิ่มหลัง rebase บน v0.13.0, 16 ก.ย.) ปุ่ม Download บนหน้าเว็บ capz อ่าน `api.github.com/repos/wadjakorn/capz/releases/latest`** (`src/hooks/use-latest-release.ts`) ถ้า release ของ Tesseract ถูกนับเป็น "latest" ปุ่ม Download Windows บนเว็บจะชี้ไปที่ zip ของ Tesseract แทนตัวติดตั้ง capz — Task 2 จึง publish เป็น `--prerelease --latest=false` (prerelease ไม่มีวันถูกเลือกเป็น latest)
8. **(เพิ่มหลัง rebase) README ประกาศ Code signing policy ของ SignPath Foundation ว่า "Signed binaries are built from this repository's source"** plan นี้ใส่ binary สำเร็จรูปของบุคคลที่สาม (UB-Mannheim) 27 ไฟล์ลงใน installer ที่จะถูกเซ็น ซึ่งอาจขัดกับข้อความนั้นหรือเงื่อนไขของ SignPath Foundation — **ยังไม่ได้ตรวจเงื่อนไขจริง** ดูด่าน "ก่อนเริ่ม" ข้างล่าง
9. **(เพิ่มหลัง rebase) CLAUDE.md ไม่มีข้อ "no cloud in v1" แล้ว** เปลี่ยนเป็น "privacy policy ใน README ต้องจริงเสมอ" Tesseract ทำงานในเครื่องทั้งหมด ไม่ส่งข้อมูลออก privacy policy จึงไม่ต้องแก้ แต่ Task 7 ต้องยืนยันซ้ำ

upstream ที่ rebase ทับ (v0.13.0: `worker/`, `tauri-plugin-opener`, install id, Feedback tab) **ไม่แตะไฟล์ OCR เลย** จุดที่ plan แก้ร่วมกับ upstream (`Cargo.toml`, `.gitignore`, `README.md`, `PROGRESS-FEATURE.md`) เป็นคนละบรรทัด ไม่ชนกัน

---

## ⛔ ด่านก่อนเริ่ม — ต้องตอบก่อน Task 2

**SignPath:** ต้องยืนยันว่าเงื่อนไขของ SignPath Foundation อนุญาตให้ installer ที่เซ็นมี binary open source ของบุคคลที่สามที่ไม่ได้ build จาก source ในรีโปนี้ ถ้า**ไม่อนุญาต** Task 2 ทั้งหมด (repackage binary สำเร็จรูป) ใช้ไม่ได้ ต้องกลับไปออกแบบใหม่ เช่น build Tesseract จาก source ใน CI หรือไม่เซ็นเฉพาะไฟล์เหล่านั้น — Task 1 ทำได้ก่อนเพราะไม่ขึ้นกับคำตอบนี้ Task 3–4 ก็ทำได้ (ไม่ขึ้นกับว่า binary มาจากไหน)

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `.github/workflows/rust-windows.yml` | **ใหม่** — clippy + test บน Windows ทุก PR ที่แตะ Rust |
| `scripts/package-tesseract-windows.sh` | **ใหม่** — (maintainer, Linux) repackage installer → zip ขั้นต่ำ |
| `scripts/fetch-tesseract-windows.sh` | **ใหม่** — (CI) ดาวน์โหลด zip + verify → `src-tauri/vendor/tesseract/` |
| `scripts/make-ocr-fixture.py` | **ใหม่** — สร้างภาพทดสอบ |
| `src-tauri/tests/fixtures/ocr-thai-mixed.png` | **ใหม่** — ภาพทดสอบ (commit) |
| `src-tauri/src/services/ocr/tesseract.rs` | **ใหม่** — parser (Task 3) + backend (Task 4) |
| `src-tauri/src/services/ocr/mod.rs` | `pub mod tesseract;` / ถอด `pub mod windows;` |
| `src-tauri/src/services/ocr/windows.rs` | **ลบ** |
| `src-tauri/src/commands/ocr.rs` | รับ `AppHandle`, สลับ Windows branch |
| `src-tauri/tauri.windows.conf.json` | **ใหม่** — resources เฉพาะ Windows |
| `src-tauri/Cargo.toml` | ถอด crate `windows` |
| `.github/workflows/build.yml` | ขั้น fetch ก่อน tauri-action |
| `.github/workflows/update-cask.yml` | guard เฉพาะ tag `v*` |
| `.gitignore` | `src-tauri/vendor/`, `dist/` |
| `src/stores/ocr.ts`, `src/stores/ocr.test.ts` | ข้อความ toast |
| `docs/OCR-THAI-WINDOWS.th.md`, `README.md`, `PROGRESS-FEATURE.md` | เอกสาร |

---

### Task 1: Windows Rust check บน PR CI

ทำก่อนแตะโค้ด OCR — **ครั้งแรกที่โค้ด Rust ฝั่ง Windows ถูก compile บน PR** ถ้า job นี้พังกับโค้ดปัจจุบัน (รวม `windows.rs` เดิม) นั่นคือสิ่งที่เราอยากรู้ ให้หยุดและรายงาน อย่าข้ามไป Task ถัดไป

**Files:**
- Create: `.github/workflows/rust-windows.yml`

**Interfaces:**
- Consumes: —
- Produces: workflow `rust (windows)` job `check` — Task 5 เพิ่มขั้น fetch และ env `CAPZ_TESSERACT_DIR`

- [ ] **Step 1: สร้าง workflow**

```yaml
name: rust (windows)

# Compiles, lints and unit-tests the Rust core on Windows for every PR that
# touches it. Before this existed, Windows-only Rust was first compiled by the
# tag-triggered release build (build.yml) — i.e. at release time.
on:
  pull_request:
    paths:
      - "src-tauri/**"
      - "scripts/fetch-tesseract-windows.sh"
      - ".github/workflows/rust-windows.yml"
  push:
    branches: [main]
    paths:
      - "src-tauri/**"
      - "scripts/fetch-tesseract-windows.sh"
      - ".github/workflows/rust-windows.yml"
  workflow_dispatch:

jobs:
  check:
    name: clippy + tests (windows)
    runs-on: windows-latest
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
          key: windows-check

      # tauri::generate_context! requires frontendDist (../out) to exist at
      # compile time. The Rust check does not need a real frontend build.
      - name: Stub frontend dist
        run: mkdir -p out && echo '<!doctype html>' > out/index.html

      - name: Clippy
        working-directory: src-tauri
        run: cargo clippy --all-targets -- -D warnings

      - name: Unit tests
        working-directory: src-tauri
        run: cargo test --lib
```

- [ ] **Step 2: Commit, push และเปิด draft PR**

`gh workflow run` ใช้ไม่ได้กับ workflow ที่ยังไม่อยู่บน `main` จึงให้ trigger `pull_request` สั่งรันแทน

```bash
git add .github/workflows/rust-windows.yml
git commit -m "ci: clippy and unit tests for the Rust core on Windows PRs"
git push -u origin HEAD
gh pr create --draft --title "feat(ocr): Tesseract as the Windows OCR engine" \
  --body "Implements docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md — work in progress."
```

- [ ] **Step 3: ดูผล**

```bash
sleep 20
gh run watch "$(gh run list --workflow 'rust (windows)' --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Expected: PASS ภายใน ~15 นาที (build แรกไม่มี cache)
ถ้า FAIL: **หยุด** เก็บ log (`gh run view --log-failed`) รายงานผู้ใช้ — ห้ามแก้ `windows.rs` เดิม เพราะ Task 5 จะลบมันอยู่แล้ว ถ้าพังเพราะ `windows.rs` ให้บันทึกไว้แล้วข้ามไป Task 2 ได้ ถ้าพังเพราะส่วนอื่นต้องแก้ก่อน

---

### Task 2: Repackage Tesseract เป็น release asset ของ capz

**Files:**
- Create: `scripts/package-tesseract-windows.sh`
- Create: `scripts/fetch-tesseract-windows.sh`
- Modify: `.github/workflows/update-cask.yml` (job-level `if`)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: —
- Produces: release tag `tesseract-win64-5.4.0.20240606-capz1` พร้อม asset `tesseract-win64-5.4.0.20240606-capz1.zip`; `scripts/fetch-tesseract-windows.sh` สร้าง `src-tauri/vendor/tesseract/tesseract.exe` + `src-tauri/vendor/tesseract/tessdata/{tha,eng}.traineddata` + DLL 26 ตัว

- [ ] **Step 1: เขียนสคริปต์ package** (`scripts/package-tesseract-windows.sh`, `chmod +x`)

```bash
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
```

- [ ] **Step 2: เขียนสคริปต์ fetch** (`scripts/fetch-tesseract-windows.sh`, `chmod +x`)

```bash
#!/usr/bin/env bash
# Download the pinned capz Tesseract bundle into src-tauri/vendor/tesseract/.
# Run by CI on Windows before any cargo/tauri build (tauri.windows.conf.json
# bundles that directory). Produced by package-tesseract-windows.sh.
set -euo pipefail

NAME="tesseract-win64-5.4.0.20240606-capz1"
URL="https://github.com/wadjakorn/capz/releases/download/${NAME}/${NAME}.zip"
ASSET_SHA256="PIN_ME"

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
```

`PIN_ME` เป็นค่าตั้งต้นโดยเจตนา — สคริปต์ปฏิเสธการทำงานจนกว่า Step 6 จะปักค่าจริง

- [ ] **Step 3: กัน `update-cask.yml` ไม่ให้ทำงานกับ release ที่ไม่ใช่ของแอป**

ใน `.github/workflows/update-cask.yml` หา job แรกใต้ `jobs:` แล้วเพิ่มบรรทัด `if:` ระดับ job (ถัดจากชื่อ job):

```yaml
    # Only app releases (tags v*). Other releases — e.g. the bundled Tesseract
    # asset (tesseract-win64-*) — carry no .dmg and must not touch the tap.
    if: github.event_name == 'workflow_dispatch' || startsWith(github.event.release.tag_name, 'v')
```

ตรวจ: `grep -n "startsWith(github.event.release.tag_name" .github/workflows/update-cask.yml` ต้องเจอ 1 บรรทัด

- [ ] **Step 4: `.gitignore`**

เพิ่มท้ายไฟล์:

```
# Tesseract bundle fetched by scripts/fetch-tesseract-windows.sh
src-tauri/vendor/
# scripts/package-tesseract-windows.sh output
dist/
```

- [ ] **Step 5: รัน package บน Linux**

```bash
command -v 7z >/dev/null || sudo apt-get install -y p7zip-full
scripts/package-tesseract-windows.sh
```

Expected: บรรทัดสุดท้ายเป็น `<64 hex>  tesseract-win64-5.4.0.20240606-capz1.zip` ขนาด zip ราว 10–14 MB (DLL บีบอัดได้)

- [ ] **Step 6: ปัก hash ลง fetch script**

```bash
H=$(cut -d' ' -f1 dist/tesseract-win64-5.4.0.20240606-capz1.zip.sha256)
sed -i "s/^ASSET_SHA256=.*/ASSET_SHA256=\"$H\"/" scripts/fetch-tesseract-windows.sh
grep '^ASSET_SHA256=' scripts/fetch-tesseract-windows.sh
```

- [ ] **Step 7: commit (ยังไม่ publish)**

```bash
git add scripts/package-tesseract-windows.sh scripts/fetch-tesseract-windows.sh .github/workflows/update-cask.yml .gitignore
git commit -m "build: repackage Tesseract for Windows and pin the bundle hash"
git push
```

- [ ] **Step 8: ⛔ ขออนุมัติผู้ใช้ก่อน publish release**

การ publish เป็นการกระทำภายนอกที่ย้อนยาก ต้องได้ "yes" ชัดเจน แจ้งผู้ใช้: tag, ขนาด zip, hash, และว่า Step 3 กัน cask ไว้แล้ว — **แต่ guard ใน Step 3 อยู่บน branch นี้เท่านั้น** workflow ที่ทำงานตอน release event คือเวอร์ชันบน default branch (`main`) ดังนั้นต้อง merge Step 3 เข้า `main` ก่อน publish ไม่งั้น guard ไม่มีผล ทางเลือก: เปิด PR เฉพาะ Step 3 แยกให้ merge ก่อน

- [ ] **Step 9: publish (หลังได้อนุมัติ และ guard อยู่บน `main` แล้ว)**

```bash
gh release create tesseract-win64-5.4.0.20240606-capz1 \
  dist/tesseract-win64-5.4.0.20240606-capz1.zip \
  --title "Tesseract 5.4.0 bundle for capz Windows (capz1)" \
  --notes "Build input, not an app release. Repackaged from UB-Mannheim tesseract-ocr-w64-setup-5.4.0.20240606.exe by scripts/package-tesseract-windows.sh: 26-DLL closure, debug-stripped, tessdata_fast tha+eng @ 8741641. Apache-2.0." \
  --prerelease --latest=false
```

`--prerelease` สำคัญ: หน้าเว็บ capz หาไฟล์ Windows จาก `releases/latest` (ข้อเท็จจริงข้อ 7) prerelease ไม่มีวันถูกเลือกเป็น latest ส่วน `release: published` ยังยิงกับ prerelease อยู่ guard ใน Step 3 จึงยังจำเป็น

- [ ] **Step 9b: ยืนยันว่าหน้าเว็บยังชี้ไปที่ capz**

```bash
gh api repos/wadjakorn/capz/releases/latest -q .tag_name
```

Expected: `v0.13.0` หรือเวอร์ชันแอปล่าสุด — **ห้ามเป็น** `tesseract-win64-*`

- [ ] **Step 10: ตรวจว่า fetch ทำงานจริง**

```bash
scripts/fetch-tesseract-windows.sh && ls src-tauri/vendor/tesseract | wc -l
gh run list --workflow update-cask.yml --limit 1
```

Expected: `tesseract bundle ready at ...`, ไฟล์ 30 รายการ (exe + 26 DLL + 2 license + tessdata/); run ล่าสุดของ update-cask เป็น `skipped` ไม่ใช่ `failure`

---

### Task 3: TSV parser และ helper บริสุทธิ์ (TDD)

**Files:**
- Create: `src-tauri/src/services/ocr/tesseract.rs`
- Modify: `src-tauri/src/services/ocr/mod.rs` (เพิ่ม `pub mod tesseract;`)

**Interfaces:**
- Consumes: `OcrBox`, `OcrWord`, `OcrLine` จาก `super`
- Produces:
  - `pub fn upscale_factor(width: u32, height: u32) -> f64`
  - `pub fn fix_thai(s: &str) -> String`
  - `pub struct TsvWord { pub line_key: (u32, u32, u32), pub text: String, pub bbox: OcrBox }`
  - `pub fn parse_tsv_words(tsv: &str) -> Vec<TsvWord>`
  - `pub fn build_lines(txt: &str, words: Vec<TsvWord>, scale: f64) -> Vec<OcrLine>`

- [ ] **Step 1: ลงทะเบียน module**

ใน `src-tauri/src/services/ocr/mod.rs` เหนือบรรทัด `#[cfg(target_os = "macos")]` ที่อยู่ก่อน `pub mod macos;` เพิ่ม:

```rust
// Compiled everywhere (not just Windows) so its parser and real-engine test
// run on Linux; only the Windows build constructs the backend.
pub mod tesseract;
```

- [ ] **Step 2: เขียนเทสต์ที่ fail** — สร้าง `src-tauri/src/services/ocr/tesseract.rs` มีแค่ส่วนนี้

```rust
//! Tesseract OCR backend — the Windows engine. See
//! docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md.
#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use super::{OcrBox, OcrLine, OcrWord};

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &str =
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

    fn tsv(rows: &[&str]) -> String {
        std::iter::once(HEADER)
            .chain(rows.iter().copied())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Thai has no spaces, so Tesseract reports one glyph cluster per "word".
    fn two_lines() -> String {
        tsv(&[
            "1\t1\t0\t0\t0\t0\t0\t0\t200\t100\t-1\t",
            "4\t1\t1\t1\t1\t0\t10\t10\t80\t30\t-1\t",
            "5\t1\t1\t1\t1\t1\t10\t10\t20\t30\t93.1\tที่",
            "5\t1\t1\t1\t1\t2\t32\t10\t20\t30\t92.0\tแก้",
            "5\t1\t1\t1\t1\t3\t70\t12\t20\t20\t95.5\tok",
            "5\t1\t1\t1\t1\t4\t95\t12\t5\t20\t-1\t ",
            "5\t1\t1\t1\t2\t1\t10\t60\t50\t20\t96.0\tHello",
            "5\t1\t1\t1\t2\t2\t70\t60\t50\t20\t96.0\tworld",
        ])
    }

    fn bx(x: f64, y: f64, w: f64, h: f64) -> OcrBox {
        OcrBox { x, y, w, h }
    }

    #[test]
    fn upscale_factor_caps_long_side_and_never_downscales() {
        assert_eq!(upscale_factor(800, 600), 3.0);
        assert_eq!(upscale_factor(1248, 1828), 4000.0 / 1828.0);
        assert_eq!(upscale_factor(5000, 100), 1.0);
        assert_eq!(upscale_factor(0, 0), 1.0);
    }

    #[test]
    fn fix_thai_composes_sara_am() {
        assert_eq!(fix_thai("ค\u{0E4D}\u{0E32}นวณ"), "คำนวณ");
        assert_eq!(fix_thai("plain"), "plain");
    }

    #[test]
    fn parse_keeps_only_non_blank_level5_rows() {
        let words = parse_tsv_words(&two_lines());
        assert_eq!(words.len(), 5);
        assert_eq!(words[0].text, "ที่");
        assert_eq!(words[0].line_key, (1, 1, 1));
        assert_eq!(words[0].bbox, bx(10.0, 10.0, 20.0, 30.0));
        assert_eq!(words[4].line_key, (1, 1, 2));
    }

    #[test]
    fn parse_keeps_tabs_inside_text() {
        let words = parse_tsv_words(&tsv(&["5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t90\ta\tb"]));
        assert_eq!(words[0].text, "a\tb");
    }

    #[test]
    fn parse_skips_malformed_rows() {
        let words = parse_tsv_words(&tsv(&[
            "5\t1\tshort",
            "5\t1\t1\t1\t1\t1\tLEFT\t0\t5\t5\t90\tbad",
        ]));
        assert!(words.is_empty());
    }

    #[test]
    fn build_lines_takes_text_from_txt_and_geometry_from_tsv() {
        let lines = build_lines("ที่แก้ ok\n\nHello world\n", parse_tsv_words(&two_lines()), 1.0);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "ที่แก้ ok");
        assert_eq!(lines[0].bbox, bx(10.0, 10.0, 80.0, 30.0));
        assert_eq!(lines[0].words.len(), 3);
        assert_eq!(lines[1].text, "Hello world");
    }

    #[test]
    fn build_lines_falls_back_to_space_join_when_txt_is_misaligned() {
        let lines = build_lines("only one line\n", parse_tsv_words(&two_lines()), 1.0);
        assert_eq!(lines[0].text, "ที่ แก้ ok");
        assert_eq!(lines[1].text, "Hello world");
    }

    #[test]
    fn build_lines_maps_boxes_back_through_the_upscale() {
        let lines = build_lines("ที่แก้ ok\nHello world\n", parse_tsv_words(&two_lines()), 2.0);
        assert_eq!(lines[0].bbox, bx(5.0, 5.0, 40.0, 15.0));
        assert_eq!(lines[0].words[0].bbox, bx(5.0, 5.0, 10.0, 15.0));
    }

    #[test]
    fn build_lines_applies_the_thai_fix_to_lines_and_words() {
        let t = tsv(&["5\t1\t1\t1\t1\t1\t0\t0\t9\t9\t90\tค\u{0E4D}\u{0E32}"]);
        let lines = build_lines("ค\u{0E4D}\u{0E32}\n", parse_tsv_words(&t), 1.0);
        assert_eq!(lines[0].text, "คำ");
        assert_eq!(lines[0].words[0].text, "คำ");
    }
}
```

- [ ] **Step 3: รันให้ fail**

Run: `cd src-tauri && cargo test --lib services::ocr::tesseract`
Expected: FAIL — compile error `cannot find function 'upscale_factor'` (และตัวอื่น)

- [ ] **Step 4: implement** — แทรกโค้ดนี้ใน `tesseract.rs` ระหว่างบรรทัด `use super::...` กับ `#[cfg(test)]`

```rust
/// Upscaling 3× cut CER from 10.0% to 7.1% on a real screenshot (research §8),
/// but a 4K capture at 3× is 11520×6480. Cap the long side instead of fixing 3×.
const MAX_UPSCALE: f64 = 3.0;
const MAX_LONG_SIDE: f64 = 4000.0;

pub fn upscale_factor(width: u32, height: u32) -> f64 {
    let long = f64::from(width.max(height));
    if long == 0.0 {
        return 1.0;
    }
    (MAX_LONG_SIDE / long).clamp(1.0, MAX_UPSCALE)
}

/// Tesseract emits SARA AM decomposed (NIKHAHIT + SARA AA). Recomposing it
/// removed a full CER point in research §8.
pub fn fix_thai(s: &str) -> String {
    s.replace("\u{0E4D}\u{0E32}", "\u{0E33}")
}

#[derive(Debug, Clone, PartialEq)]
pub struct TsvWord {
    /// (block_num, par_num, line_num) — identifies the line a word belongs to.
    pub line_key: (u32, u32, u32),
    pub text: String,
    pub bbox: OcrBox,
}

/// Parse Tesseract's `tsv` output into level-5 (word) rows. Structure rows,
/// blank words, the header and malformed rows are skipped.
pub fn parse_tsv_words(tsv: &str) -> Vec<TsvWord> {
    tsv.lines()
        .filter_map(|row| {
            // 12 columns; `text` is last and may itself contain tabs.
            let f: Vec<&str> = row.splitn(12, '\t').collect();
            if f.len() < 12 || f[0] != "5" {
                return None;
            }
            let text = f[11].trim_end_matches('\r');
            if text.trim().is_empty() {
                return None;
            }
            let int = |i: usize| f[i].parse::<u32>().ok();
            let num = |i: usize| f[i].parse::<f64>().ok();
            Some(TsvWord {
                line_key: (int(2)?, int(3)?, int(4)?),
                text: text.to_string(),
                bbox: OcrBox { x: num(6)?, y: num(7)?, w: num(8)?, h: num(9)? },
            })
        })
        .collect()
}

/// Combine one engine run's `txt` and `tsv` outputs into lines. Text comes from
/// `txt`, which spaces Thai correctly; geometry comes from `tsv`. A `txt` line is
/// trusted only when, whitespace removed, it equals its TSV words concatenated —
/// otherwise the words are joined with spaces. Boxes are divided by `scale` to
/// undo the upscale.
pub fn build_lines(txt: &str, words: Vec<TsvWord>, scale: f64) -> Vec<OcrLine> {
    let mut groups: Vec<Vec<TsvWord>> = Vec::new();
    for w in words {
        match groups.last_mut() {
            Some(g) if g[0].line_key == w.line_key => g.push(w),
            _ => groups.push(vec![w]),
        }
    }
    let txt_lines: Vec<&str> = txt.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let aligned = txt_lines.len() == groups.len();
    let squash = |s: &str| s.chars().filter(|c| !c.is_whitespace()).collect::<String>();

    groups
        .into_iter()
        .enumerate()
        .map(|(i, g)| {
            let concat: String = g.iter().map(|w| w.text.as_str()).collect();
            let text = match txt_lines.get(i) {
                Some(t) if aligned && squash(t) == squash(&concat) => (*t).to_string(),
                _ => g.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "),
            };
            let bbox = scale_box(&union(g.iter().map(|w| &w.bbox)), scale);
            let words = g
                .iter()
                .map(|w| OcrWord { text: fix_thai(&w.text), bbox: scale_box(&w.bbox, scale) })
                .collect();
            OcrLine { text: fix_thai(&text), bbox, words }
        })
        .collect()
}

fn union<'a>(boxes: impl Iterator<Item = &'a OcrBox>) -> OcrBox {
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for b in boxes {
        x0 = x0.min(b.x);
        y0 = y0.min(b.y);
        x1 = x1.max(b.x + b.w);
        y1 = y1.max(b.y + b.h);
    }
    OcrBox { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

fn scale_box(b: &OcrBox, scale: f64) -> OcrBox {
    OcrBox { x: b.x / scale, y: b.y / scale, w: b.w / scale, h: b.h / scale }
}
```

- [ ] **Step 5: รันให้ผ่าน + clippy**

Run: `cd src-tauri && cargo test --lib services::ocr && cargo clippy --all-targets -- -D warnings`
Expected: PASS ทั้ง 9 เทสต์ใหม่ + 4 เทสต์เดิมใน `mod.rs`; clippy ไม่มี warning

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/ocr/tesseract.rs src-tauri/src/services/ocr/mod.rs
git commit -m "feat(ocr): parse Tesseract txt+tsv output into OCR lines"
```

---

### Task 4: `TesseractBackend` + เทสต์กับ engine จริง

**Files:**
- Modify: `src-tauri/src/services/ocr/tesseract.rs`
- Create: `scripts/make-ocr-fixture.py`
- Create: `src-tauri/tests/fixtures/ocr-thai-mixed.png`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 3; `OcrBackend`, `run_detect` จาก `super`
- Produces:
  - `pub struct TesseractBackend` (fields private: `exe: PathBuf`, `tessdata: PathBuf`)
  - `pub fn TesseractBackend::new(exe: PathBuf, tessdata: PathBuf) -> Self`
  - `pub fn TesseractBackend::from_dir(dir: &Path) -> Self` — คาดหวัง `<dir>/tesseract.exe` และ `<dir>/tessdata/`
  - `pub fn tesseract_langs(languages: &[String]) -> String`
  - env ของเทสต์: `CAPZ_TESSERACT_DIR`

- [ ] **Step 1: สร้าง fixture**

`scripts/make-ocr-fixture.py`:

```python
"""Render src-tauri/tests/fixtures/ocr-thai-mixed.png — light-on-dark mixed
Thai/English, echoing the terminal screenshot measured in research §8.
Needs Pillow and the Loma font (Ubuntu: fonts-tlwg-loma-otf). The PNG is
committed; re-run only to change the fixture."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/opentype/tlwg/Loma.otf"
LINES = [
    "ที่แก้จริง",
    "1. เทียบที่ตัวรูป ไม่ใช่ที่ object สุ่ม 8x8 จุด",
    "",
    "2. ไม่ล้างปกทันทีเมื่อ metadata ยังไม่มีรูป",
    'tree) ตอนนี้รอ 1.2 วินาที "เพลงนี้ไม่มีปก"',
    "",
    "342 JVM tests ผ่านหมด, ลบ log ออกแล้ว",
]

out = Path(__file__).resolve().parent.parent / "src-tauri/tests/fixtures/ocr-thai-mixed.png"
font = ImageFont.truetype(FONT, 24)
img = Image.new("RGB", (1100, 420), (20, 20, 20))
draw = ImageDraw.Draw(img)
for i, text in enumerate(LINES):
    draw.text((20, 20 + i * 55), text, font=font, fill="white")
img.save(out)
print(out)
```

Run: `python3 scripts/make-ocr-fixture.py && python3 -c "from PIL import Image; print(Image.open('src-tauri/tests/fixtures/ocr-thai-mixed.png').size)"`
Expected: `(1100, 420)`

- [ ] **Step 2: เขียนเทสต์ที่ fail** — ต่อท้ายใน `mod tests` ของ `tesseract.rs`

```rust
    #[test]
    fn tesseract_langs_maps_tags_and_puts_thai_first() {
        let tags = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(tesseract_langs(&tags(&["en-US", "th-TH"])), "tha+eng");
        assert_eq!(tesseract_langs(&tags(&["en-US"])), "eng");
        assert_eq!(tesseract_langs(&tags(&["fr-FR"])), "eng");
    }

    #[test]
    fn missing_engine_reports_a_broken_install_not_a_user_fix() {
        let backend = TesseractBackend::from_dir(Path::new("/nonexistent/capz-tesseract"));
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ocr-thai-mixed.png");
        let err = backend.recognize(fixture, &["en-US".into()]).unwrap_err().to_string();
        assert!(err.contains("installation is incomplete"), "{err}");
    }

    /// Real engine on the committed fixture. Passes vacuously when no engine is
    /// found (macOS dev machines). Runs on the Linux dev box
    /// (`apt install tesseract-ocr tesseract-ocr-tha`) and in the Windows PR job
    /// against the bundled exe via CAPZ_TESSERACT_DIR.
    #[test]
    fn reads_thai_and_english_with_the_real_engine() {
        let Some(backend) = real_backend() else {
            eprintln!("skipping: no tesseract (set CAPZ_TESSERACT_DIR or install tesseract-ocr-tha)");
            return;
        };
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ocr-thai-mixed.png");
        assert!(
            backend.available_languages().iter().any(|l| l == "tha"),
            "tha.traineddata missing from {}",
            backend.tessdata.display()
        );

        let result = crate::services::ocr::run_detect(&backend, fixture).expect("ocr");

        assert!(result.thai_available);
        assert_eq!((result.width, result.height), (1100, 420));
        let all = result.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n");
        assert!(all.contains("metadata"), "{all}");
        assert!(all.contains("JVM"), "{all}");
        assert!(all.contains("ผ่าน"), "{all}");
        let thai = all.chars().filter(|c| ('\u{0E00}'..='\u{0E7F}').contains(c)).count();
        assert!(thai > 40, "only {thai} Thai chars:\n{all}");
        for line in &result.lines {
            let b = &line.bbox;
            assert!(
                b.x >= 0.0 && b.y >= 0.0 && b.x + b.w <= 1100.5 && b.y + b.h <= 420.5,
                "box outside the original image — upscale not undone? {b:?}"
            );
        }
    }

    fn real_backend() -> Option<TesseractBackend> {
        if let Ok(dir) = std::env::var("CAPZ_TESSERACT_DIR") {
            return Some(TesseractBackend::from_dir(Path::new(&dir)));
        }
        let exe = std::env::var_os("PATH").and_then(|paths| {
            std::env::split_paths(&paths).map(|p| p.join("tesseract")).find(|p| p.is_file())
        })?;
        let tessdata = ["/usr/share/tesseract-ocr/5/tessdata", "/opt/homebrew/share/tessdata"]
            .into_iter()
            .map(PathBuf::from)
            .find(|p| p.join("tha.traineddata").is_file())?;
        Some(TesseractBackend::new(exe, tessdata))
    }
```

- [ ] **Step 3: รันให้ fail**

Run: `cd src-tauri && cargo test --lib services::ocr::tesseract`
Expected: FAIL — compile error `cannot find type 'TesseractBackend'`

- [ ] **Step 4: implement** — แก้ส่วน import ด้านบนของ `tesseract.rs` เป็น:

```rust
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context};

use super::{OcrBackend, OcrBox, OcrLine, OcrWord};
```

แล้วแทรกโค้ดนี้ก่อน `#[cfg(test)]`:

```rust
pub struct TesseractBackend {
    exe: PathBuf,
    tessdata: PathBuf,
}

impl TesseractBackend {
    pub fn new(exe: PathBuf, tessdata: PathBuf) -> Self {
        Self { exe, tessdata }
    }

    /// The layout scripts/fetch-tesseract-windows.sh produces and
    /// tauri.windows.conf.json bundles: `<dir>/tesseract.exe` + `<dir>/tessdata/`.
    pub fn from_dir(dir: &Path) -> Self {
        Self::new(dir.join("tesseract.exe"), dir.join("tessdata"))
    }

    fn run_engine(&self, input: &Path, base: &Path, langs: &str) -> anyhow::Result<(String, String)> {
        let mut cmd = Command::new(&self.exe);
        cmd.arg(input)
            .arg(base)
            .args(["-l", langs, "--psm", "6", "--tessdata-dir"])
            .arg(&self.tessdata)
            .args(["txt", "tsv"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW — otherwise every Detect text flashes a console.
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd
            .output()
            .with_context(|| format!("failed to start {}", self.exe.display()))?;
        if !out.status.success() {
            bail!(
                "tesseract exited with {}: {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        let read = |ext: &str| {
            let p = base.with_extension(ext);
            std::fs::read_to_string(&p).with_context(|| format!("tesseract wrote no {}", p.display()))
        };
        Ok((read("txt")?, read("tsv")?))
    }
}

/// Map `pick_languages` BCP-47 tags to traineddata names, Thai first (the order
/// measured in research §8). Falls back to English.
pub fn tesseract_langs(languages: &[String]) -> String {
    let mut out: Vec<&str> = Vec::new();
    for tag in languages {
        let tag = tag.to_ascii_lowercase();
        let code = if tag.starts_with("th") {
            "tha"
        } else if tag.starts_with("en") {
            "eng"
        } else {
            continue;
        };
        if !out.contains(&code) {
            out.push(code);
        }
    }
    if out.is_empty() {
        out.push("eng");
    }
    out.sort_by_key(|c| *c != "tha");
    out.join("+")
}

impl OcrBackend for TesseractBackend {
    fn available_languages(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.tessdata) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| {
                let path = e.ok()?.path();
                if path.extension().and_then(|x| x.to_str()) != Some("traineddata") {
                    return None;
                }
                let stem = path.file_stem()?.to_str()?.to_string();
                (stem != "osd").then_some(stem)
            })
            .collect()
    }

    fn recognize(
        &self,
        image_path: &str,
        languages: &[String],
    ) -> anyhow::Result<(u32, u32, Vec<OcrLine>)> {
        // Nothing the user can do about this one — say so, don't send them
        // looking for a setting (see #79).
        if !self.exe.is_file() {
            bail!(
                "bundled OCR engine not found at {} — the capz installation is incomplete; reinstall capz",
                self.exe.display()
            );
        }
        let img = image::open(image_path).with_context(|| format!("failed to open {image_path}"))?;
        let (width, height) = (img.width(), img.height());
        let factor = upscale_factor(width, height);
        let prepared = if factor > 1.0 {
            let w = (f64::from(width) * factor).round() as u32;
            let h = (f64::from(height) * factor).round() as u32;
            img.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
        } else {
            img
        };

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        // `capz-temp-` so image_service::sweep_stale_temp removes leftovers after a crash.
        let base = std::env::temp_dir().join(format!("capz-temp-ocr-{stamp}"));
        let input = base.with_extension("png");
        prepared
            .save(&input)
            .with_context(|| format!("failed to write {}", input.display()))?;

        let run = self.run_engine(&input, &base, &tesseract_langs(languages));
        for ext in ["png", "txt", "tsv"] {
            let _ = std::fs::remove_file(base.with_extension(ext));
        }
        let (txt, tsv) = run?;
        Ok((width, height, build_lines(&txt, parse_tsv_words(&tsv), factor)))
    }
}
```

ข้อความ error ต้องมีคำว่า `installation is incomplete` ตามเทสต์ใน Step 2

- [ ] **Step 5: รันให้ผ่าน — ต้องเห็นเทสต์ engine จริงทำงานจริง ไม่ใช่ข้าม**

```bash
command -v tesseract || sudo apt-get install -y tesseract-ocr tesseract-ocr-tha
cd src-tauri && cargo test --lib services::ocr::tesseract -- --nocapture 2>&1 | tail -20
cargo clippy --all-targets -- -D warnings
```

Expected: PASS 12 เทสต์ และ **output ต้องไม่มีคำว่า `skipping:`** — ถ้ามี แปลว่าเทสต์ engine จริงไม่ได้รัน ถือว่ายังไม่ผ่าน

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/ocr/tesseract.rs scripts/make-ocr-fixture.py src-tauri/tests/fixtures/ocr-thai-mixed.png
git commit -m "feat(ocr): Tesseract subprocess backend, tested against the real engine"
```

---

### Task 5: ต่อสายเข้าแอป ลบ WinRT backend และให้ CI Windows ทดสอบ binary จริง

**Files:**
- Modify: `src-tauri/src/commands/ocr.rs` (ทั้งไฟล์)
- Modify: `src-tauri/src/services/ocr/mod.rs` (ถอด `pub mod windows;`)
- Delete: `src-tauri/src/services/ocr/windows.rs`
- Modify: `src-tauri/Cargo.toml` (ถอด `windows`)
- Create: `src-tauri/tauri.windows.conf.json`
- Modify: `.github/workflows/rust-windows.yml`

**Interfaces:**
- Consumes: `TesseractBackend::from_dir` (Task 4); `scripts/fetch-tesseract-windows.sh` (Task 2); job `check` (Task 1)
- Produces: `ocr_detect(app: AppHandle, path: String)` — frontend `invoke("ocr_detect", { path })` ไม่ต้องเปลี่ยน เพราะ Tauri inject `AppHandle` ให้เอง

- [ ] **Step 1: เขียน `commands/ocr.rs` ใหม่ทั้งไฟล์**

```rust
use tauri::AppHandle;

use crate::services::ocr::{run_detect, OcrResult};

/// Detect text in the image at `path`. Runs OCR on a blocking thread so the UI
/// stays responsive. Returns top-left pixel-space boxes in image coordinates.
#[tauri::command]
pub async fn ocr_detect(app: AppHandle, path: String) -> Result<OcrResult, String> {
    tauri::async_runtime::spawn_blocking(move || detect_blocking(&app, &path))
        .await
        .map_err(|e| format!("ocr task join error: {e}"))?
}

fn detect_blocking(app: &AppHandle, path: &str) -> Result<OcrResult, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let backend = crate::services::ocr::macos::VisionBackend::new();
        run_detect(&backend, path).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        // Bundled by tauri.windows.conf.json from src-tauri/vendor/tesseract.
        let dir = app
            .path()
            .resolve("vendor/tesseract", tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())?;
        let backend = crate::services::ocr::tesseract::TesseractBackend::from_dir(&dir);
        run_detect(&backend, path).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, path);
        Err("OCR is only supported on macOS and Windows".to_string())
    }
}
```

- [ ] **Step 2: ถอด module และลบไฟล์**

ใน `src-tauri/src/services/ocr/mod.rs` ลบสองบรรทัดนี้:

```rust
#[cfg(target_os = "windows")]
pub mod windows;
```

```bash
git rm src-tauri/src/services/ocr/windows.rs
```

- [ ] **Step 3: ถอด crate `windows`** (ใช้แค่ใน `windows.rs` — ตรวจแล้ว: `grep -rn "use windows::" src-tauri/src` ไม่เจอที่อื่น; `windows::show_editor` ฯลฯ ใน `tray.rs` คือ module `crate::windows` ของ capz เอง ไม่ใช่ crate)

```bash
cd src-tauri && cargo remove --target 'cfg(target_os = "windows")' windows
grep -n '^windows = ' Cargo.toml || echo "removed"
grep -n '^windows-sys' Cargo.toml
```

Expected: `removed` และ `windows-sys` ยังอยู่

- [ ] **Step 4: resources เฉพาะ Windows** — สร้าง `src-tauri/tauri.windows.conf.json`

```json
{
  "bundle": {
    "resources": ["icons/tray/*.png", "vendor/tesseract/**/*"]
  }
}
```

Tauri merge ไฟล์นี้ทับ `tauri.conf.json` ด้วย JSON Merge Patch ซึ่ง **แทนที่ array ทั้งก้อน** จึงต้องใส่ `icons/tray/*.png` ซ้ำ ไม่งั้น tray icon หายบน Windows การแยกไฟล์ทำให้ macOS/Linux build ไม่ต้องมี `vendor/tesseract`

- [ ] **Step 5: ตรวจบน Linux**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test --lib
grep -rn "Media_Ocr\|services::ocr::windows\|WindowsBackend" src-tauri/src src-tauri/Cargo.toml || echo "clean"
```

Expected: PASS ทั้งหมด, `clean`

- [ ] **Step 6: ให้ CI Windows ใช้ binary จริง** — ใน `.github/workflows/rust-windows.yml` เพิ่ม step ใหม่ **ก่อน** `Clippy`:

```yaml
      # tauri.windows.conf.json bundles src-tauri/vendor/tesseract, so the build
      # script needs it present; the tests run the real engine from it.
      - name: Fetch bundled Tesseract
        run: scripts/fetch-tesseract-windows.sh
```

และแก้ step `Unit tests` เป็น:

```yaml
      - name: Unit tests
        working-directory: src-tauri
        env:
          CAPZ_TESSERACT_DIR: ${{ github.workspace }}/src-tauri/vendor/tesseract
        run: cargo test --lib -- --nocapture
```

- [ ] **Step 7: Commit, push, ดูผล Windows**

```bash
git add -A src-tauri .github/workflows/rust-windows.yml
git commit -m "feat(ocr): use Tesseract on Windows, remove the Windows.Media.Ocr backend"
git push
gh run watch "$(gh run list --workflow 'rust (windows)' --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
gh run view "$(gh run list --workflow 'rust (windows)' --limit 1 --json databaseId -q '.[0].databaseId')" --log | grep -E "reads_thai_and_english_with_the_real_engine|skipping:"
```

Expected: PASS และบรรทัดที่ grep ได้เป็น `... reads_thai_and_english_with_the_real_engine ... ok` **โดยไม่มี `skipping:`** — นี่คือหลักฐานชิ้นแรกว่า `tesseract.exe` ที่ strip แล้วรันได้จริงบน Windows และ `CREATE_NO_WINDOW` ไม่ทำให้ spawn พัง

---

### Task 6: Release build ดึง Tesseract ก่อน build

**Files:**
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `scripts/fetch-tesseract-windows.sh` (Task 2)
- Produces: `.msi` / NSIS ที่มี `vendor/tesseract/` อยู่ใน resources

- [ ] **Step 1: เพิ่ม step** — ใน job ที่มี `matrix` แทรกก่อน step `Build + release via tauri-action`:

```yaml
      - name: Fetch bundled Tesseract (Windows)
        if: matrix.os == 'windows-latest'
        shell: bash
        run: scripts/fetch-tesseract-windows.sh
```

- [ ] **Step 2: build แบบไม่ release แล้วตรวจของใน installer**

`build.yml` บน `workflow_dispatch` build อย่างเดียว ไม่สร้าง release (ตามคอมเมนต์ในไฟล์):

```bash
git add .github/workflows/build.yml
git commit -m "ci: bundle Tesseract into the Windows release build"
git push
gh workflow run build.yml --ref "$(git branch --show-current)"
sleep 10
RUN=$(gh run list --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status
gh run download "$RUN" -n capz-windows-x64 -D /tmp/claude-1000/capz-win
7z l /tmp/claude-1000/capz-win/*.msi | grep -ciE "tesseract.exe|tha.traineddata|libtesseract"
ls -la /tmp/claude-1000/capz-win/*.msi
```

Expected: build PASS, grep นับได้ ≥ 3, และ `.msi` ใหญ่ขึ้นราว 10–14 MB จาก v0.12.0 (บันทึกตัวเลขจริงไว้ใช้ใน Task 7)
ถ้า grep ได้ 0: resource glob ไม่ทำงาน — หยุดและรายงาน

---

### Task 7: เอกสาร ข้อความ toast และ tracker

**Files:**
- Modify: `docs/OCR-THAI-WINDOWS.th.md` (เขียนใหม่ทั้งไฟล์)
- Modify: `src/stores/ocr.ts` (description ฝั่ง Windows)
- Modify: `src/stores/ocr.test.ts` (เทสต์ Windows)
- Modify: `README.md` (บรรทัดลิงก์เอกสาร)
- Modify: `PROGRESS-FEATURE.md` (รายการ OCR text reader)
- Modify: `docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md` §3 (ตัวเลขขนาด)

**Interfaces:**
- Consumes: ขนาด `.msi` จริงจาก Task 6 Step 2
- Produces: —

หลัง feature นี้ `thaiAvailable` บน Windows เป็น `true` toast จะขึ้นก็ต่อเมื่อไฟล์ภาษาไทยที่ bundle มาหายเท่านั้น — ข้อความเดิม ("Windows ไม่มีชุด OCR ภาษาไทย...") จะผิดทันที

- [ ] **Step 1: แก้เทสต์ให้ fail ก่อน** — ใน `src/stores/ocr.test.ts` แทนเทสต์ `"tells Windows users there is nothing to install, and links the note"` ทั้งบล็อกด้วย:

```ts
  it("tells Windows users the bundled Thai data is broken, and links the note", async () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    try {
      detectText.mockResolvedValue(fakeEmpty(false));
      useOcr.getState().setKey("/img/a.png");
      await useOcr.getState().detect();
      const call = toast.mock.calls.find((c) => String(c[0]).includes("Thai"));
      expect(call?.[1]?.description).toContain("OCR-THAI-WINDOWS.th.md");
      expect(call?.[1]?.description).toContain("ติดตั้ง capz ใหม่");
      // Must NOT resurrect the impossible install instructions (#79).
      expect(call?.[1]?.description).not.toContain("Language & region");
      expect(call?.[1]?.description).not.toContain("Optical character recognition");
    } finally {
      vi.unstubAllGlobals();
    }
  });
```

Run: `pnpm test:unit src/stores/ocr.test.ts`
Expected: FAIL — `expected ... to contain "ติดตั้ง capz ใหม่"`

- [ ] **Step 2: แก้ข้อความ** — ใน `src/stores/ocr.ts` แทน description ฝั่ง `isWindows()` (สามบรรทัดที่ขึ้นต้นด้วย `"Windows ไม่มีชุด OCR ภาษาไทย...`) ด้วย:

```ts
            ? "ไฟล์อ่านภาษาไทยที่มากับ capz หายหรือเสียหาย — ลองติดตั้ง capz ใหม่ " +
              "ถ้ายังไม่หาย กรุณาแจ้งปัญหา · " +
              `รายละเอียด: ${THAI_OCR_NOTE_URL}`
```

Run: `pnpm test:unit src/stores/ocr.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc สะอาด

- [ ] **Step 3: เขียน `docs/OCR-THAI-WINDOWS.th.md` ใหม่ทั้งไฟล์**

````markdown
# การอ่านตัวอักษรภาษาไทย (OCR) บน Windows

> เอกสารนี้เขียนเป็นภาษาไทยแบบเข้าใจง่าย สำหรับผู้ใช้ทั่วไป (ไม่ใช่สายเทคนิค)

## สรุปสั้น ๆ

**capz บน Windows อ่านภาษาไทยได้แล้ว** ไม่ต้องติดตั้งหรือตั้งค่าอะไรเพิ่ม —
ทุกอย่างที่ต้องใช้มากับตัวติดตั้ง capz แล้ว

> ℹ️ ถ้าเคยอ่านเอกสารฉบับเก่าที่ให้ไปเพิ่มภาษาไทยใน Windows Settings
> ไม่ต้องทำแล้ว (และที่จริงทำไม่ได้ตั้งแต่แรก — Windows ไม่มีชุด OCR ภาษาไทย)

## ทำไมเมื่อก่อนอ่านไม่ได้?

capz เคยใช้ระบบอ่านตัวอักษรที่ติดมากับ Windows ซึ่งรองรับ 35 ภาษา แต่ไม่มีภาษาไทย
ตอนนี้ capz ใช้ **Tesseract** ซึ่งเป็นโปรแกรมอ่านตัวอักษรแบบโอเพนซอร์สที่รองรับภาษาไทย
และทำงานบนเครื่องของคุณทั้งหมด ไม่ส่งรูปไปไหน

## สิ่งที่ควรรู้

อ่านภาษาไทยได้ดีพอจะ **ไล่อ่านและค้นหาข้อความ** ในรูป แต่ยังไม่สมบูรณ์:

- **วรรณยุกต์บางตัวอาจหาย** โดยเฉพาะที่อยู่บนสระ อิ อี อื เช่น `ที่` อาจออกมาเป็น `ที`
  หรือ `เมื่อ` เป็น `เมือ`
- **ตัวหนาและหัวข้อ** มักอ่านพลาดมากกว่าตัวอักษรปกติ
- ถ้าจะก๊อปข้อความไทยไปใช้ต่อ **ควรตรวจทานก่อน**

ภาษาอังกฤษอ่านได้ตามปกติ

## ถ้าขึ้นข้อความว่าอ่านภาษาไทยไม่ได้

แปลว่าไฟล์ที่มากับ capz หายหรือเสียหาย ไม่ใช่เพราะคุณตั้งค่าอะไรผิด
ให้ลอง **ติดตั้ง capz ใหม่** ถ้ายังไม่หาย กรุณาแจ้งปัญหา

## ต้องการความช่วยเหลือ

แจ้งปัญหาได้ที่: **https://github.com/wadjakorn/capz/issues**
````

- [ ] **Step 4: README และ tracker**

`README.md` — แทนข้อความ `why Thai OCR does not work on Windows` ด้วย `Thai OCR on Windows: what to expect`

`PROGRESS-FEATURE.md` — ในรายการ `**OCR text reader**` แทน `(macOS Vision + Windows.Media.Ocr)` ด้วย `(macOS Vision; Windows: bundled Tesseract subprocess, see docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md)`

- [ ] **Step 4b: ยืนยัน privacy policy ใน README ยังจริง**

CLAUDE.md กำหนดให้ privacy policy ต้องจริงเสมอ (เงื่อนไข SignPath) Tesseract รันในเครื่อง ไม่มี network — ตรวจว่าโค้ด backend ไม่มีการเรียกเครือข่าย:

```bash
grep -nE "http|reqwest|TcpStream|ureq" src-tauri/src/services/ocr/tesseract.rs || echo "no network"
```

Expected: `no network` → ไม่ต้องแก้หัวข้อ Privacy policy ใน README

- [ ] **Step 5: แก้ตัวเลขขนาดใน spec §3**

ในตาราง "ขนาดที่ต้องจ่าย" ของ spec แทนทั้งตารางและบล็อก `⚠️` ถัดไปด้วยตัวเลขที่วัดแล้ว (26 DLL + exe หลัง strip 22.7 MB, traineddata 5.2 MB, zip บีบอัด และขนาด `.msi` ที่เพิ่มขึ้นจริงจาก Task 6) และหมายเหตุว่าตัวเลข ~11 MB เดิมประเมินจาก Linux ซึ่งใช้ shared lib ของระบบ

- [ ] **Step 6: Commit**

```bash
git add docs/OCR-THAI-WINDOWS.th.md src/stores/ocr.ts src/stores/ocr.test.ts README.md PROGRESS-FEATURE.md docs/superpowers/specs/2026-09-14-tesseract-windows-ocr-design.md
git commit -m "docs(ocr): Thai OCR now works on Windows; set expectations on accuracy"
```

---

### Task 8: ด่านก่อน merge — ต้องใช้เครื่อง Windows จริง

ทำโดยผู้ใช้หรือคนที่มีเครื่อง Windows **ไม่มีทางทำจาก Linux** ห้าม merge จนกว่าจะผ่าน หรือผู้ใช้ตัดสินใจรับความเสี่ยงเป็นลายลักษณ์อักษร

- [ ] **Step 1: ติดตั้ง `.msi` จาก Task 6 บนเครื่อง Windows** ทับเวอร์ชันเดิม
- [ ] **Step 2: Thai smoke** — แคปหน้าจอที่มีภาษาไทย → Detect text → ต้องเห็นกรอบบนข้อความไทย เลือก + ก๊อปได้ **และไม่มีหน้าต่าง console กระพริบ**
- [ ] **Step 3: resource path** — ถ้า Step 2 ได้ error ให้ดูข้อความ: path ที่ขึ้นมาคือที่ `resolve("vendor/tesseract")` ชี้ไป เทียบกับ `C:\Program Files\capz\` ว่าไฟล์อยู่ตรงไหนจริง
- [ ] **Step 4: English regression** — เอาภาพภาษาอังกฤษ 3 ภาพ (เว็บ, เอกสาร, โค้ด) Detect text บน v0.12.0 (WinRT) และบน build นี้ บันทึกผลเทียบกันใน PR — เป็นความเสี่ยงที่ spec §4 ระบุว่ายังไม่ได้วัด
- [ ] **Step 5: เวลา** — จับเวลา Detect text บนสกรีนช็อตเต็มจอ ถ้าเกิน ~3 วินาที บันทึกไว้ (spec §6: เหตุผลที่จะย้ายไป `leptess`)
- [ ] **Step 6: license ของ DLL** — UB-Mannheim ship แค่ LICENSE ของ Tesseract DLL อีก 25 ตัวมี license ของตัวเอง (OpenSSL: Apache-2.0, libarchive: BSD, libstdc++/libgcc: GPL + runtime exception ฯลฯ) ผู้ใช้ต้องตัดสินใจว่าจะเพิ่มไฟล์ third-party notices ก่อน ship หรือไม่ — **plan นี้ไม่ได้ตัดสินแทน**
- [ ] **Step 7: SignPath + README** — ถ้าด่านก่อนเริ่มยืนยันว่าเซ็นได้ ให้แก้ประโยค "Signed binaries are built from this repository's source" ใน README หัวข้อ Code signing policy ให้ตรงความจริง (installer มี Tesseract binary ที่ repackage จาก UB-Mannheim ด้วย) ถ้อยคำให้ผู้ใช้อนุมัติ

---

## งานต่อยอด (ไม่อยู่ใน plan นี้)

- **`tessdata_best` เทียบ `tessdata_fast`** (spec §9 ค) — `tha` best ใหญ่ 7.6 MB (fast 1.0 MB), `eng` best 15.4 MB (fast 4.1 MB) รวมจะเพิ่ม ~18 MB ต่อการอัปเดต ต้องวัดบน**สกรีนช็อตจริง**ก่อนตัดสิน ภาพสังเคราะห์ไม่พอ (สะอาดเกินจริง — fixture ของ Task 4 ไม่ตกวรรณยุกต์เลยทั้งที่ภาพจริงตก 34%) ภาพจริงที่ใช้ใน research §8 ถูกลบจาก cache ไปแล้ว ต้องขอใหม่จากผู้ใช้
- ย้ายไป `leptess` ถ้า Task 8 Step 5 พบว่าช้าจริง
