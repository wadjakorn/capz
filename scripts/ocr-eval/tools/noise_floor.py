"""Noise floor for gate R1: the Python reference vs itself on the same images with ±1 noise
on 1% of pixels, scored with identical_share. Usage:
  uv run python -I tools/noise_floor.py MODEL_DIR CORPUS_DIR OUT.json && score with gates.identical_share"""
"""Python reference vs itself on imperceptibly perturbed input, scored with the same
identical_share as gate R1 — the noise floor any re-implementation has to beat."""
import json, subprocess, sys
import numpy as np, cv2
from pathlib import Path
model, corpus, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(model))
from runtime.line_engine import LineOCR
o = LineOCR(str(model), threads=1, runtime={"backend": "onnxruntime"}, ori={"enabled": False}, det={"split_gap": 0})
rng = np.random.default_rng(0)
res = {}
for p in sorted(corpus.glob("dev-*.png")):
    if p.name.endswith(".ink.png"): continue
    img = cv2.imread(str(p))
    noisy = img.astype(np.int16); m = rng.random(img.shape[:2]) < 0.01
    noisy[m] += rng.choice([-1, 1], size=(int(m.sum()), 1)); noisy = np.clip(noisy, 0, 255).astype(np.uint8)
    def lines(r):
        out = []
        for l in r["lines"]:
            xs = [q[0] for q in l["box"]]; ys = [q[1] for q in l["box"]]
            out.append({"text": l["text"], "box": [min(xs), min(ys), max(xs)-min(xs), max(ys)-min(ys)]})
        return out
    res[p.stem] = {"clean": lines(o.read(img)), "noisy": lines(o.read(noisy))}
out.write_text(json.dumps(res, ensure_ascii=False))
