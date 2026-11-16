# CP-0100 OCR scope re-scan — Implementation Plan

**Goal:** after a CP-0099 scope box, OpenThai re-scans the padded box. Its lines are merged
by the spec's rules, so small-text areas gain the lines the whole-image scan missed, plus
better readings.

**Spec:** `docs/superpowers/specs/2026-11-16-cp0100-ocr-scope-rescan-design.md`

**Constraints:**
- pnpm only, no new packages.
- No settings change.
- New strings go through `t()`: `app.ocr.scopeScanning`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1 — Rust: `region` on `ocr_detect`, `engine` on `OcrResult`

- `imgops::crop_rect(img, x, y, w, h)`. Unit test: pixels and size.
- `OpenThaiBackend::read_lines_region(path, region, threads)`: load, clamp the region
  (an empty region is an error), crop, `eng.read`, then offset line bbox, quad and word
  quads by `(x, y)`. Returns full-image `w, h`.
- `OcrRegion { x, y, w, h }` (deserialize, camelCase).
- `OcrResult.engine: String` ("vision" | "openthai").
- `ocr_detect(path, engine, region: Option<OcrRegion>)`:
  - Vision + region → `Err`;
  - OpenThai + region → `read_lines_region`.
- Tests:
  - real engine on `fixtures/mixed_line.png`: a region over the right half returns words
    whose x ≥ region.x and still reads them;
  - a clamped out-of-range region;
  - a zero-size region → error.
- Gate: `cargo test` (ocr), `cargo clippy --all-targets -- -D warnings`.

### Task 2 — `src/lib/ocrRescan.ts` (pure merge) + tests

- `paddedRegion(rect, imgW, imgH): OcrBox`.
- `detScale(imgW, imgH)`.
- `mergeRescan(whole, crop, padded, imgW, imgH): OcrLine[]`, following spec rules 2–5,
  minus the final `scopeLines`, which the caller runs.
- Tests:
  - padding and clamping;
  - edge-touching line dropped, except on a clamped side;
  - single-character junk dropped;
  - a crop line overlapping nothing is added;
  - a crop line replaces a small whole line (words removed, remainder rebuilt);
  - a crop line overlapping a large whole line is discarded;
  - a mixed overlap is discarded.

### Task 3 — Store: automatic re-scan

- `detectText(path, engine, region?)`; `OcrResult.engine?: "vision" | "openthai"`.
- `OcrScope.rescan?: "scanning" | "done"`.
- `setScope`:
  - when `result.engine === "openthai"`: set `rescan: "scanning"`, skip the empty toast,
    and enqueue;
  - otherwise behave as in CP-0099.
- Queue: at most one in flight; `pending` holds only the latest. On settle, apply only if
  `get().scope === scope && currentKey === key && resultEngine === engine`. Then run the
  pending entry.
- Apply: `lines = scopeLines(mergeRescan(...), rect)`, `rescan: "done"`, and the
  `noText` toast if empty. On error: `rescan: "done"`, keep the lines, toast `noText` if
  empty, `console.warn`.
- Tests (mocked `detectText`):
  - an openthai re-scan adds a missed line;
  - vision → no second call;
  - Esc/clear mid-scan → result discarded;
  - two quick boxes → two calls in order, only the last applied;
  - the empty toast is deferred;
  - an error keeps the filtered lines.

### Task 4 — OcrLayer: spinner + re-select if untouched; e2e

- Spinner `[data-ocr-scope-busy]` at the box's top-right while `rescan === "scanning"`,
  `aria-label={t("app.ocr.scopeScanning")}`.
- Re-select: remember the auto-selected text after `selectLayer()` (`autoTextRef`). When
  a scope with the same `rect` gets new lines, call `selectLayer()` only if
  `getSelection().toString() === autoTextRef.current`.
- e2e in `e2e/web/ocr.spec.ts`. The mock `ocr_detect` returns `engine: "openthai"`; with
  `args.region` it returns full-image lines including a line the whole scan lacked.
  - a box shows the spinner, then the missed line appears and is selected;
  - a user's own selection is left alone;
  - Esc mid-scan discards the result;
  - a vision result makes no second call.
- Gate: L1 + L3.

### Task 5 — L4 visual, manual QA, tracker, L2/L5

- `e2e/visual/editor-ocr-rescan.spec.ts` (spinner → merged).
- Manual QA rows (Windows p50, macOS tract latency, real Retina screenshot).
- `PROGRESS-FEATURE.md` entry.
- Run clippy (L2) and L5, if `tauri-driver` is installed.
