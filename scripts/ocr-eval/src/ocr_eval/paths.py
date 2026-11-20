"""Where the harness keeps things. Nothing here is committed except via
docs/research/evidence/openthai2-ocr/ (EVIDENCE)."""
from __future__ import annotations

import os
from pathlib import Path

from . import pins

PKG_ROOT = Path(__file__).resolve().parents[2]  # scripts/ocr-eval
REPO_ROOT = PKG_ROOT.parents[1]
CACHE = Path(os.environ.get("CAPZ_OCR_EVAL_CACHE", Path.home() / ".cache" / "capz-ocr-eval"))
RUNS = PKG_ROOT / "runs"
DATA = PKG_ROOT / "data"
EVIDENCE = REPO_ROOT / "docs" / "research" / "evidence" / "openthai2-ocr"


def model_dir() -> Path:
    return CACHE / "models" / pins.OPENTHAI_REV


def tessdata_dir() -> Path:
    return CACHE / "tessdata" / pins.TESSDATA_COMMIT


def fonts_dir() -> Path:
    return CACHE / "fonts"


def corpus_dir(split: str) -> Path:
    return CACHE / "corpus" / split
