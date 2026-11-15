"""The two OCR fixtures capz already has, as a scored split ("fixtures").

Boxes come from the image itself (horizontal ink bands on a dark background);
texts are transcribed in data/fixtures/<name>.gt.json and cross-checked against
Vision (see each file's "notes")."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess

import numpy as np
from PIL import Image

from .. import paths

SOURCES = {
    "thai_latin": ("file", "src-tauri/tests/fixtures/thai_latin.png"),
    "ocr-thai-mixed": ("git", "origin/feat/tesseract-windows-ocr:src-tauri/tests/fixtures/ocr-thai-mixed.png"),
}


def ink_bands(img: Image.Image, thresh: int = 100, gap: int = 6) -> list[list[int]]:
    g = np.asarray(img.convert("L")) > thresh
    rows = np.nonzero(g.any(axis=1))[0]
    bands, start, prev = [], None, None
    for y in rows:
        if start is None:
            start = prev = y
        elif y - prev > gap:
            bands.append((start, prev))
            start = y
        prev = y
    if start is not None:
        bands.append((start, prev))
    out = []
    for y0, y1 in bands:
        cols = np.nonzero(g[y0:y1 + 1].any(axis=0))[0]
        out.append([int(cols[0]), int(y0), int(cols[-1] - cols[0] + 1), int(y1 - y0 + 1)])
    return out


def build() -> dict:
    d = paths.corpus_dir("fixtures")
    d.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, (kind, src) in SOURCES.items():
        png = d / f"{name}.png"
        if kind == "file":
            shutil.copyfile(paths.REPO_ROOT / src, png)
        else:
            r = subprocess.run(["git", "show", src], cwd=paths.REPO_ROOT, capture_output=True)
            if r.returncode:
                continue
            png.write_bytes(r.stdout)
        spec = json.loads((paths.DATA / "fixtures" / f"{name}.gt.json").read_text(encoding="utf-8"))
        with Image.open(png) as im:
            boxes = ink_bands(im)
            w, h = im.size
        if len(boxes) != len(spec["lines"]):
            raise ValueError(f"{name}: {len(boxes)} ink bands for {len(spec['lines'])} lines")
        gt = {"id": name, "split": "fixtures", "template": "fixture", "width": w, "height": h,
              "fragments": [{"text": t, "box": b} for t, b in zip(spec["lines"], boxes)]}
        gt_bytes = json.dumps(gt, ensure_ascii=False, indent=1).encode("utf-8")
        (d / f"{name}.json").write_bytes(gt_bytes)
        files[name] = {"png": hashlib.sha256(png.read_bytes()).hexdigest(), "json": hashlib.sha256(gt_bytes).hexdigest()}
    manifest = {"split": "fixtures", "n": len(files), "files": files,
                "corpus_hash": hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()}
    (d / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest
