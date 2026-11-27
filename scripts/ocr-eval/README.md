# ocr-eval — CP-0096 OpenThai 2.0 OCR spike harness

Self-verifying eval loop: synthetic screenshots with DOM ground truth → engines
(OpenThai Python reference, Tesseract with PR #84's config, macOS Vision over SSH,
Rust prototype) → segmentation-agnostic CER → pre-registered gates.

- Plan: `docs/superpowers/plans/2026-11-15-openthai2-ocr-spike.md`
- Report: `docs/research/2026-11-15-openthai2-ocr.md`
- Evidence: `docs/research/evidence/openthai2-ocr/`
- Reference pipeline (port spec): `REFERENCE.md`

## Commands

```sh
cd scripts/ocr-eval
uv run ocr-eval fetch                          # pinned models, tessdata_fast, fonts, chromium → ~/.cache/capz-ocr-eval
uv run ocr-eval corpus --split dev --split test --split perf   # render + H2 self-check (exit 1 on failure)
uv run ocr-eval run --engine openthai --split dev [--config @file.json]   # also scores the run
uv run ocr-eval run --engine tesseract|vision|rust-ort|rust-tract --split test
uv run ocr-eval score RUN...                   # (re)score
uv run ocr-eval compare RUN_A RUN_B            # markdown table + paired bootstrap
uv run ocr-eval report RUN                     # errors.md + crops of the worst components
uv run ocr-eval sweep --split dev              # coordinate descent over OpenThai knobs
uv run ocr-eval gate --set ot_test=RUN ... [--only H1,Q1a] [--final]
uv run pytest -q
(cd rust-proto && cargo test --features backend-ort && cargo clippy --all-targets --features backend-ort -- -D warnings)
```

`vision` needs `ssh macbook-pro` (Swift + Vision run in a throwaway `/tmp` dir there).

## Layout

| path | what |
|---|---|
| `src/ocr_eval/corpus/` | templates, phrase pools, fonts, Chromium render, DOM ground truth (`gt_extract.js`), H2 checks, fixtures |
| `src/ocr_eval/engines/` | one adapter per engine; all return boxes in input-image pixels |
| `src/ocr_eval/metrics/` | normalize, geometric matching, CER/class recall/slices, paired bootstrap |
| `src/ocr_eval/{sweep,gates,report,pipeline,perf,size}.py` | the loop around it |
| `rust-proto/` | Rust port of OpenThai2.0-OCR-Text (`backend-ort`, `backend-tract`) |
| `data/` | hand-picked mixed phrases, fixture transcriptions |
| `runs/`, `~/.cache/capz-ocr-eval/` | run outputs and downloads (not committed) |

Debug switches in the Rust prototype: `OPENTHAI_DUMP=<dir>` (detector input and prob map),
`OPENTHAI_TIMING=1` (per-stage timings), `OPENTHAI_ORT_ARENA=1` (ORT memory arena back on).
