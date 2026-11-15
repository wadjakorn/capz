"""Tesseract exactly as PR #84 ships it on Windows: tessdata_fast tha+eng,
--psm 6, upscale clamp(4000/long side, 1, 3) with Lanczos, ํา → ำ."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

from .. import paths

MAX_UPSCALE = 3.0
MAX_LONG_SIDE = 4000.0
B0: dict = {}


def available() -> bool:
    return shutil.which("tesseract") is not None and (paths.tessdata_dir() / "tha.traineddata").exists()


def upscale_factor(width: int, height: int) -> float:
    long = float(max(width, height))
    if long == 0.0:
        return 1.0
    return min(max(MAX_LONG_SIDE / long, 1.0), MAX_UPSCALE)


def fix_thai(s: str) -> str:
    return s.replace("ํา", "ำ")


def parse_tsv(tsv: str, scale: float) -> list[dict]:
    groups: OrderedDict[tuple, list] = OrderedDict()
    for row in tsv.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or cols[0] != "5":
            continue
        text = "\t".join(cols[11:])
        if not text.strip():
            continue
        try:
            left, top, w, h = (int(c) for c in cols[6:10])
            conf = float(cols[10])
        except ValueError:
            continue
        groups.setdefault((cols[2], cols[3], cols[4]), []).append((text, left, top, w, h, conf))
    out = []
    for words in groups.values():
        x0 = min(w[1] for w in words)
        y0 = min(w[2] for w in words)
        x1 = max(w[1] + w[3] for w in words)
        y1 = max(w[2] + w[4] for w in words)
        out.append({"text": fix_thai(" ".join(w[0] for w in words)),
                    "box": [x0 / scale, y0 / scale, (x1 - x0) / scale, (y1 - y0) / scale],
                    "conf": sum(w[5] for w in words) / len(words) / 100})
    return out


def _one(item: tuple[str, Path], psm: int) -> dict:
    sid, path = item
    img = Image.open(path).convert("RGB")
    W, H = img.size
    t0 = time.perf_counter()
    f = upscale_factor(W, H)
    work = img.resize((round(W * f), round(H * f)), Image.LANCZOS) if f != 1.0 else img
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "in.png"
        work.save(p)
        env = dict(os.environ, OMP_THREAD_LIMIT="1")
        r = subprocess.run(["tesseract", str(p), "stdout", "-l", "tha+eng", "--psm", str(psm),
                            "--tessdata-dir", str(paths.tessdata_dir()),
                            # not the "tsv" config file: a tessdata dir without configs/ (PR #84's
                            # bundle) silently ignores it and writes no TSV at all
                            "-c", "tessedit_create_tsv=1"],
                           capture_output=True, text=True, env=env)
    ms = (time.perf_counter() - t0) * 1000
    if r.returncode != 0:
        raise RuntimeError(f"tesseract failed on {sid}: {r.stderr[-500:]}")
    return {"id": sid, "width": W, "height": H, "elapsed_ms": round(ms, 1), "lines": parse_tsv(r.stdout, f)}


def recognize(items: list[tuple[str, Path]], config: dict, workers: int = 6) -> dict:
    psm = int(config.get("psm", 6))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return {p["id"]: p for p in ex.map(lambda it: _one(it, psm), items)}
