"""Pair predicted lines with ground-truth fragments by geometry.

Engines cut lines differently (one engine reads a table row as one line,
another as five cells), so we never compare line i to line i. A GT fragment
and a predicted line are linked when they overlap enough on both axes; linked
items form a component (union-find) and each component is scored as one
string pair. Unlinked GT = missed text; unlinked prediction = false positive."""
from __future__ import annotations

from dataclasses import dataclass, field

MIN_OVERLAP_Y = 0.5  # of the shorter height
MIN_OVERLAP_X = 0.3  # of the narrower width


@dataclass
class Component:
    gt_text: str
    pred_text: str
    gt_idx: list[int] = field(default_factory=list)
    pred_idx: list[int] = field(default_factory=list)


def _linked(a: list[float], b: list[float]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    oy = min(ay + ah, by + bh) - max(ay, by)
    ox = min(ax + aw, bx + bw) - max(ax, bx)
    return oy >= MIN_OVERLAP_Y * min(ah, bh) and ox >= MIN_OVERLAP_X * min(aw, bw) and ox > 0 and oy > 0


def _reading_order(items: list[dict]) -> list[dict]:
    if not items:
        return []
    hs = sorted(max(1.0, it["box"][3]) for it in items)
    band = hs[len(hs) // 2] * 0.5
    return sorted(items, key=lambda it: (round((it["box"][1] + it["box"][3] / 2) / band), it["box"][0]))


def match(gt: list[dict], pred: list[dict]) -> list[Component]:
    n = len(gt) + len(pred)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, g in enumerate(gt):
        for j, p in enumerate(pred):
            if _linked(g["box"], p["box"]):
                parent[find(i)] = find(len(gt) + j)
    groups: dict[int, tuple[list[int], list[int]]] = {}
    for k in range(n):
        gi, pj = groups.setdefault(find(k), ([], []))
        (gi if k < len(gt) else pj).append(k if k < len(gt) else k - len(gt))
    out = []
    for gi, pj in groups.values():
        g_items = _reading_order([gt[i] for i in gi])
        p_items = _reading_order([pred[j] for j in pj])
        out.append(Component(" ".join(x["text"] for x in g_items), " ".join(x["text"] for x in p_items),
                             sorted(gi), sorted(pj)))
    return out
