"""OpenCV INTER_LINEAR (8-bit) fixed-point model used by rust-proto's resize_linear:
compares the model against cv2.resize on 200 random up/down sizes and one real 2x
downscale. Expect 0 differing values. Usage: uv run python tools/resize_exact_check.py"""
from pathlib import Path

import cv2
import numpy as np


def coefs(nd, ns, zero_frac_at_edges):
    scale = ns / nd
    r = []
    for d in range(nd):
        f = np.float32((d + 0.5) * scale - 0.5)
        s = int(np.floor(f))
        f = np.float32(f - np.float32(s))
        if zero_frac_at_edges:
            if s < 0:
                f, s = np.float32(0), 0
            if s >= ns - 1:
                f, s = np.float32(0), ns - 1
        r.append((min(max(s, 0), ns - 1), min(max(s + 1, 0), ns - 1),
                  int(np.rint((np.float32(1.0) - f) * np.float32(2048))), int(np.rint(f * np.float32(2048)))))
    return np.array(r)


def resize(src, nw, nh):
    h, w, c = src.shape
    X, Y = coefs(nw, w, True), coefs(nh, h, False)
    S = src.astype(np.int64)
    Hr = S[:, X[:, 0], :] * X[:, 2][None, :, None] + S[:, X[:, 1], :] * X[:, 3][None, :, None]
    A, B = Hr[Y[:, 0]].reshape(nh, -1), Hr[Y[:, 1]].reshape(nh, -1)
    b0, b1 = Y[:, 2][:, None], Y[:, 3][:, None]
    v = ((((A >> 4) * b0) >> 16) + (((B >> 4) * b1) >> 16) + 2) >> 2
    return np.clip(v, 0, 255).astype(np.uint8).reshape(nh, nw, c)


rng = np.random.default_rng(3)
bad = tot = 0
for _ in range(200):
    h, w = rng.integers(4, 120, 2)
    nh, nw = int(rng.integers(4, 120)), int(rng.integers(4, 300))
    img = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
    ref = cv2.resize(img, (nw, nh))
    bad += int((resize(img, nw, nh) != ref).sum())
    tot += ref.size
real = Path.home() / ".cache/capz-ocr-eval/corpus/dev/dev-0007.png"
img = cv2.imread(str(real))
bad2 = int((resize(img, 1280, 800) != cv2.resize(img, (1280, 800))).sum()) if img is not None else None
print(f"random sizes: {bad} of {tot} values differ; real 2560x1600 -> 1280x800: {bad2}")
