"""The Rust prototype (rust-proto/), one build per inference runtime."""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from .. import paths

CRATE = paths.PKG_ROOT / "rust-proto"
B0: dict = {}


def binary(backend: str) -> Path:
    return CRATE / "target" / backend / "release" / "openthai-proto"


def build(backend: str) -> Path:
    subprocess.run(["cargo", "build", "--release", "--quiet", "--features", f"backend-{backend}",
                    "--target-dir", str(CRATE / "target" / backend)], cwd=CRATE, check=True)
    return binary(backend)


def _make(backend: str):
    def available() -> bool:
        return shutil.which("cargo") is not None and (paths.model_dir() / "rec.onnx").exists()

    def recognize(items: list[tuple[str, Path]], config: dict, workers: int = 6, threads: int = 1) -> dict:
        exe = build(backend)
        chunks = [items[i::workers] for i in range(workers)]
        preds = {}
        with tempfile.TemporaryDirectory() as td:
            cfg = Path(td) / "config.json"
            cfg.write_text(json.dumps(config))
            procs = []
            for k, chunk in enumerate(chunks):
                if not chunk:
                    continue
                lst, out = Path(td) / f"in{k}.tsv", Path(td) / f"out{k}.jsonl"
                lst.write_text("".join(f"{sid}\t{p}\n" for sid, p in chunk), encoding="utf-8")
                procs.append((subprocess.Popen(
                    [str(exe), "--model-dir", str(paths.model_dir()), "--images", str(lst), "--out", str(out),
                     "--config", str(cfg), "--backend", backend, "--threads", str(threads)],
                    stderr=subprocess.PIPE, text=True), out))
            for p, out in procs:
                _, err = p.communicate()
                if p.returncode != 0:
                    raise RuntimeError(f"openthai-proto ({backend}) failed: {err[-2000:]}")
                for line in out.read_text(encoding="utf-8").splitlines():
                    d = json.loads(line)
                    preds[d["id"]] = d
        return preds

    return available, recognize


class _Engine:
    def __init__(self, backend: str):
        self.available, self.recognize = _make(backend)
        self.B0 = B0
        self.backend = backend


ORT = _Engine("ort")
TRACT = _Engine("tract")
