"""Paired bootstrap over images: is run A's CER really different from run B's?"""
from __future__ import annotations

import random


def _cer(per: dict, ids: list[str]) -> float:
    n = sum(per[i]["n"] for i in ids)
    return sum(per[i]["edits"] for i in ids) / n if n else 0.0


def paired_bootstrap(a: dict, b: dict, n: int = 1000, seed: int = 0) -> tuple[float, float, float]:
    """ΔCER = CER(a) − CER(b) on the images both runs scored, with a 95% interval."""
    pa, pb = a["per_image"], b["per_image"]
    ids = sorted(set(pa) & set(pb))
    if not ids:
        return (0.0, 0.0, 0.0)
    point = _cer(pa, ids) - _cer(pb, ids)
    rng = random.Random(seed)
    ds = []
    for _ in range(n):
        s = [ids[rng.randrange(len(ids))] for _ in ids]
        ds.append(_cer(pa, s) - _cer(pb, s))
    ds.sort()
    lo, hi = ds[int(0.025 * n)], ds[min(n - 1, int(0.975 * n))]
    return (round(point, 6), round(lo, 6), round(hi, 6))
