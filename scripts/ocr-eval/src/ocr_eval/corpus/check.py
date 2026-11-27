"""Gate H2: the ground truth matches the pixels.

coverage = share of text ink (normal render minus transparent-text render)
that falls inside the GT boxes grown by DILATE px. A box that is missing,
shifted or too small shows up as uncovered ink."""
from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass, field

import numpy as np

from .. import paths
from .render import Renderer, load_sample
from .spec import build_specs

DILATE = 2
MIN_COVERAGE = 0.995
MIN_INK_DENSITY = 0.02  # share of a fragment box that is text ink; real text is ~0.1-0.3


def coverage(gt: dict, ink: np.ndarray) -> float:
    total = int(ink.sum())
    if total == 0:
        return 1.0 if not gt["fragments"] else 0.0
    mask = np.zeros_like(ink, dtype=bool)
    H, W = ink.shape
    for f in gt["fragments"]:
        x, y, w, h = f["box"]
        mask[max(0, y - DILATE):min(H, y + h + DILATE), max(0, x - DILATE):min(W, x + w + DILATE)] = True
    return float((ink & mask).sum()) / total


def problems(gt: dict, ink: np.ndarray) -> list[str]:
    out = []
    if not gt["fragments"]:
        out.append("no fragments")
    W, H = gt["width"], gt["height"]
    if ink.shape != (H, W):
        out.append(f"ink shape {ink.shape} != {(H, W)}")
    for f in gt["fragments"]:
        x, y, w, h = f["box"]
        if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > W or y + h > H:
            out.append(f"box out of bounds {f['box']}")
        if not f["text"].strip():
            out.append("empty text")
        elif (len("".join(f["text"].split())) >= 3 and w > 0 and h > 0
              and ink[y:y + h, x:x + w].mean() < MIN_INK_DENSITY):  # 1-2 glyphs (·, -) are legitimately sparse
            out.append(f"invisible text {f['text'][:20]!r}")
    c = coverage(gt, ink)
    if c < MIN_COVERAGE:
        out.append(f"coverage {c:.4f}")
    return out


@dataclass
class CheckReport:
    ok: bool
    n: int
    coverage_min: float
    bad: list[str] = field(default_factory=list)
    determinism_checked: int = 0


def check_split(split: str, determinism_share: float = 0.25) -> CheckReport:
    d = paths.corpus_dir(split)
    manifest = json.loads((d / "manifest.json").read_text())
    specs = {s.id: s for s in build_specs(split)}
    bad, covs = [], []
    for sid in manifest["files"]:
        gt, ink = load_sample(split, sid)
        covs.append(coverage(gt, ink))
        bad += [f"{sid}: {p}" for p in problems(gt, ink)]
    rng = random.Random(0)
    redo = [sid for sid in manifest["files"] if sid in specs and rng.random() < determinism_share]
    if redo:
        with Renderer() as r:
            for sid in redo:
                png = r.render_spec(specs[sid]).png
                if hashlib.sha256(png).hexdigest() != manifest["files"][sid]["png"]:
                    bad.append(f"{sid}: re-render differs")
    return CheckReport(ok=not bad, n=len(covs), coverage_min=min(covs) if covs else 0.0, bad=bad,
                       determinism_checked=len(redo))
