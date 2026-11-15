# ocr-eval — CP-0096 OpenThai 2.0 OCR spike harness

Self-verifying eval loop: synthetic screenshots with DOM ground truth → engines
(OpenThai Python reference, Tesseract with PR #84's config, macOS Vision over SSH,
Rust prototype) → segmentation-agnostic CER → pre-registered gates.

Plan: `docs/superpowers/plans/2026-11-15-openthai2-ocr-spike.md`.
Report: `docs/research/2026-11-15-openthai2-ocr.md`.

```sh
cd scripts/ocr-eval
uv run ocr-eval fetch          # pinned models, tessdata_fast, fonts, chromium (~/.cache/capz-ocr-eval)
uv run pytest -q               # harness self-tests
```
