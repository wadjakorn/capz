"""Shared run bookkeeping for every engine adapter.

An adapter module exposes `recognize(items, config) -> {id: Pred}` where
items are (id, png path) pairs and Pred is
{"id", "width", "height", "elapsed_ms", "lines": [{"text", "box": [x,y,w,h], "conf"}]}
with boxes in the input image's pixels, origin top-left."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import socket
import subprocess
from pathlib import Path
from typing import Callable, Iterable

from .. import paths


def quad_to_box(quad) -> list[float]:
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    return [round(min(xs), 1), round(min(ys), 1), round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)]


def _git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=paths.PKG_ROOT, capture_output=True,
                              text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


def config_id(config: dict) -> str:
    return hashlib.sha1(json.dumps(config, sort_keys=True).encode()).hexdigest()[:8]


def new_run(engine: str, config: dict, split: str) -> Path:
    corpus = paths.corpus_dir(split)
    manifest = json.loads((corpus / "manifest.json").read_text())
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    d = paths.RUNS / f"{stamp}-{engine}-{split}-{config_id(config)}"
    d.mkdir(parents=True, exist_ok=False)
    (d / "run.json").write_text(json.dumps({
        "run_id": d.name, "engine": engine, "config": config, "split": split,
        "corpus_hash": manifest.get("corpus_hash"), "git_sha": _git_sha(), "host": socket.gethostname(),
        "started": dt.datetime.now().isoformat(timespec="seconds")}, indent=1))
    return d


def write_predictions(run_dir: Path, preds: Iterable[dict]) -> Path:
    p = run_dir / "predictions.jsonl"
    with open(p, "w", encoding="utf-8") as f:
        for pred in preds:
            f.write(json.dumps(pred, ensure_ascii=False) + "\n")
    return p


def split_items(split: str) -> list[tuple[str, Path]]:
    d = paths.corpus_dir(split)
    manifest = json.loads((d / "manifest.json").read_text())
    return [(sid, d / f"{sid}.png") for sid in manifest["files"]]


def run_engine(engine: str, recognize: Callable[[list, dict], dict], split: str, config: dict, **kw) -> Path:
    d = new_run(engine, config, split)
    items = split_items(split)
    preds = recognize(items, config, **kw)
    write_predictions(d, (preds[i] for i, _ in items if i in preds))
    return d
