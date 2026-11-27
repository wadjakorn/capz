"""macOS Vision on macbook-pro over SSH (the baseline capz already ships on Mac).

Images go to a fresh directory under the Mac's /tmp, which is removed when the
call returns (the Mac's disk is nearly full; nothing is left behind)."""
from __future__ import annotations

import functools
import json
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

HOST = "macbook-pro"
SWIFT = Path(__file__).with_name("vision_ocr.swift")
B0: dict = {}


def _ssh(cmd: str, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", HOST, cmd],
                          capture_output=True, text=True, timeout=timeout)


@functools.cache
def available() -> bool:
    for attempt in range(3):
        try:
            if _ssh("which swiftc", timeout=20).returncode == 0:
                return True
        except subprocess.TimeoutExpired:
            pass
        time.sleep(5 * (attempt + 1))
    return False


def recognize(items: list[tuple[str, Path]], config: dict, workers: int = 4) -> dict:
    remote = f"/tmp/ocr-eval-{uuid.uuid4().hex[:12]}"
    with tempfile.TemporaryDirectory() as td:
        stage = Path(td) / "img"
        stage.mkdir()
        for sid, p in items:
            shutil.copyfile(p, stage / f"{sid}.png")
        try:
            r = _ssh(f"mkdir -p {remote}/img")
            if r.returncode:
                raise RuntimeError(r.stderr)
            subprocess.run(["rsync", "-a", f"{stage}/", f"{HOST}:{remote}/img/"], check=True, timeout=900)
            subprocess.run(["scp", "-q", str(SWIFT), f"{HOST}:{remote}/vision_ocr.swift"], check=True, timeout=120)
            r = _ssh(f"cd {remote} && swiftc -O vision_ocr.swift -o vision_ocr 2>&1", timeout=600)
            if r.returncode:
                raise RuntimeError(f"swiftc failed: {r.stdout[-1500:]}")
            names = [f"img/{sid}.png" for sid, _ in items]
            groups = [names[i::workers] for i in range(workers)]
            cmd = " & ".join(f"(./vision_ocr {' '.join(g)} > out{k}.jsonl)" for k, g in enumerate(groups) if g)
            r = _ssh(f"cd {remote} && {cmd}; wait; cat out*.jsonl", timeout=3600)
            if r.returncode:
                raise RuntimeError(f"vision_ocr failed: {r.stderr[-1500:]}")
        finally:
            _ssh(f"rm -rf {remote}", timeout=120)  # remote is always /tmp/ocr-eval-<random>, on the Mac
    preds = {}
    for line in r.stdout.splitlines():
        if line.strip():
            d = json.loads(line)
            preds[d["id"]] = d
    return preds
