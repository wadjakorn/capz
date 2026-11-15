"""OpenThai2.0-OCR-Text through iApp's own Python runtime (the reference)."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from .. import paths

WORKER = Path(__file__).with_name("openthai_worker.py")
B0 = {"runtime": {"backend": "onnxruntime"}}


def available() -> bool:
    return (paths.model_dir() / "rec.onnx").exists()


def recognize(items: list[tuple[str, Path]], config: dict, workers: int = 1, threads: int = 1) -> dict:
    cfg = json.loads(json.dumps(config))
    cfg.setdefault("runtime", {})["backend"] = "onnxruntime"
    chunks = [items[i::workers] for i in range(workers)]
    with tempfile.TemporaryDirectory() as td:
        procs = []
        for k, chunk in enumerate(chunks):
            if not chunk:
                continue
            lst, out = Path(td) / f"in{k}.tsv", Path(td) / f"out{k}.jsonl"
            lst.write_text("".join(f"{sid}\t{p}\n" for sid, p in chunk), encoding="utf-8")
            procs.append((subprocess.Popen(
                [sys.executable, "-I", str(WORKER), "--model-dir", str(paths.model_dir()),
                 "--config-json", json.dumps(cfg), "--images-file", str(lst), "--out", str(out),
                 "--threads", str(threads)], stderr=subprocess.PIPE, text=True), out))
        preds = {}
        for p, out in procs:
            _, err = p.communicate()
            if p.returncode != 0:
                raise RuntimeError(f"openthai worker failed ({p.returncode}): {err[-2000:]}")
            for line in out.read_text(encoding="utf-8").splitlines():
                d = json.loads(line)
                preds[d["id"]] = d
    return preds
