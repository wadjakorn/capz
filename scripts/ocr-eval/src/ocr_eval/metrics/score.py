"""Turn a run's predictions into metrics.json (definitions: plan § Metric definitions)."""
from __future__ import annotations

import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

from rapidfuzz.distance import Levenshtein

from .match import match
from .normalize import CLASSES, char_class, normalize

THAI = re.compile("[ก-๎]")
LATIN = re.compile("[A-Za-z]")
URL = re.compile(r"(https?://|www\.|[\w.+-]+@[\w-]+\.|[\w-]+/[\w./-]+|\.\w{2,4}\b)")


def category(text: str) -> str:
    th, la = bool(THAI.search(text)), bool(LATIN.search(text))
    return "mixed" if th and la else "thai" if th else "english" if la else "other"


def flags(text: str) -> list[str]:
    out = []
    s = "".join(text.split())
    if s and sum(ch.isdigit() for ch in s) / len(s) >= 0.3:
        out.append("numeric")
    if URL.search(text):
        out.append("url")
    return out


def css_bucket(px: int) -> str:
    return "<=12" if px <= 12 else "13-16" if px <= 16 else ">=17"


def composites(meta: dict) -> list[str]:
    out = []
    dpr, css, theme = meta.get("dpr"), meta.get("css_px"), meta.get("theme")
    if dpr is None or css is None:
        return out
    if dpr == 2.0 and 13 <= css <= 16 and theme in ("light", "dark"):
        out.append("mac_typical")
    if 1.0 <= dpr <= 1.5 and 12 <= css <= 14 and theme in ("light", "dark"):
        out.append("win_typical")
    if dpr == 2.0 and css >= 16 and theme == "light":
        out.append("easy")
    return out


class _Acc:
    __slots__ = ("edits", "n", "fp", "comps")

    def __init__(self):
        self.edits = self.n = self.fp = self.comps = 0

    def add(self, edits: int, n: int, fp: int):
        self.edits += edits
        self.n += n
        self.fp += fp
        self.comps += 1

    def out(self) -> dict:
        n = max(self.n, 1)
        return {"cer": self.edits / n if self.n else 0.0, "cer_e2e": (self.edits + self.fp) / n if self.n else 0.0,
                "edits": self.edits, "n_chars": self.n, "fp": self.fp,
                "fp_per_1k": 1000 * self.fp / n if self.n else 0.0, "n_comp": self.comps}


def _attribute(g: str, p: str, owner: list[int]) -> tuple[list[int], list[bool]]:
    """Charge every edit of the alignment g→p to the GT fragment it happened in.
    Returns (edits per GT char position, char correct?)."""
    edits = [0] * len(g)
    ok = [False] * len(g)
    for tag, i1, i2, j1, j2 in Levenshtein.opcodes(g, p):
        if tag == "equal":
            for k in range(i1, i2):
                ok[k] = True
        elif tag == "insert":
            if g:
                edits[min(i1, len(g) - 1)] += j2 - j1
        else:  # replace / delete: one edit per GT char (replace blocks may be unequal)
            n = max(i2 - i1, j2 - j1) if tag == "replace" else i2 - i1
            for k in range(n):
                edits[i1 + min(k, i2 - i1 - 1)] += 1
    return edits, ok


def score_records(gts: list[dict], preds: dict[str, dict]) -> dict:
    overall = _Acc()
    slices: dict[str, dict[str, _Acc]] = defaultdict(lambda: defaultdict(_Acc))
    hits = {"all": defaultdict(int), "mixed": defaultdict(int)}
    tots = {"all": defaultdict(int), "mixed": defaultdict(int)}
    per_image, failed, lat = {}, [], []
    for gt in gts:
        pid = gt["id"]
        pred = preds.get(pid)
        if pred is None:
            failed.append(pid)
            lines = []
        else:
            lines = pred.get("lines", [])
            if pred.get("elapsed_ms") is not None:
                lat.append(pred["elapsed_ms"])
        img_keys = [("template", gt.get("template")), ("font", gt.get("font")), ("dpr", str(gt.get("dpr"))),
                    ("theme", gt.get("theme")), ("crop", gt.get("crop"))]
        if gt.get("css_px") is not None:
            img_keys.append(("css_px", css_bucket(gt["css_px"])))
        comp_names = composites(gt)
        img = _Acc()
        for c in match(gt["fragments"], lines):
            p = normalize(c.pred_text)
            if not c.gt_idx:
                if p:
                    overall.add(0, 0, len(p))
                    img.add(0, 0, len(p))
                    for k, v in img_keys:
                        if v is not None:
                            slices[k][v].add(0, 0, len(p))
                    for name in comp_names:
                        slices[name]["all"].add(0, 0, len(p))
                continue
            # GT side fragment by fragment, so categories never depend on how the
            # engine cut its lines (a merged Thai cell + English cell stays two items)
            segs = [(i, normalize(gt["fragments"][i]["text"])) for i in c.gt_order]
            g = "".join(t for _, t in segs)
            if not g:
                continue
            owner = [i for i, t in segs for _ in t]
            per_char, ok = _attribute(g, p, owner)
            e = sum(per_char)
            overall.add(e, len(g), 0)
            img.add(e, len(g), 0)
            for k, v in img_keys:
                if v is not None:
                    slices[k][v].add(e, len(g), 0)
            for name in comp_names:
                slices[name]["all"].add(e, len(g), 0)
            pos = 0
            for i, t in segs:
                if not t:
                    continue
                fe = sum(per_char[pos:pos + len(t)])
                raw = gt["fragments"][i]["text"]
                cat = category(raw)
                slices["category"][cat].add(fe, len(t), 0)
                slices["category_dpr"][f"{cat}@{gt.get('dpr')}"].add(fe, len(t), 0)
                for fl in flags(raw):
                    slices["flag"][fl].add(fe, len(t), 0)
                for name in comp_names:
                    slices[name][cat].add(fe, len(t), 0)
                for k in range(pos, pos + len(t)):
                    cl = char_class(g[k])
                    for scope in ("all", "mixed") if cat == "mixed" else ("all",):
                        tots[scope][cl] += 1
                        hits[scope][cl] += ok[k]
                pos += len(t)
        per_image[pid] = {"edits": img.edits, "n": img.n, "fp": img.fp}
    class_recall = {
        scope: {c: {"hit": hits[scope][c], "total": tots[scope][c],
                    "recall": hits[scope][c] / tots[scope][c] if tots[scope][c] else None} for c in CLASSES}
        for scope in hits}
    latency = {}
    if lat:
        s = sorted(lat)
        latency = {"p50_ms": statistics.median(s), "p95_ms": s[min(len(s) - 1, int(0.95 * len(s)))],
                   "mean_ms": statistics.fmean(s), "n": len(s)}
    return {"overall": overall.out(), "slices": {k: {v: a.out() for v, a in d.items()} for k, d in slices.items()},
            "class_recall": class_recall, "per_image": per_image, "failed_images": failed, "latency": latency}


def score_run(run_dir: Path, corpus_dir: Path) -> dict:
    run_dir, corpus_dir = Path(run_dir), Path(corpus_dir)
    run = json.loads((run_dir / "run.json").read_text())
    manifest = json.loads((corpus_dir / "manifest.json").read_text())
    if run.get("corpus_hash") and manifest.get("corpus_hash") and run["corpus_hash"] != manifest["corpus_hash"]:
        raise ValueError(f"stale run {run_dir.name}: made on corpus {run['corpus_hash'][:8]}, "
                         f"corpus is now {manifest['corpus_hash'][:8]}")
    gts = [json.loads((corpus_dir / f"{sid}.json").read_text(encoding="utf-8")) for sid in manifest["files"]]
    preds = {}
    with open(run_dir / "predictions.jsonl", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                p = json.loads(line)
                preds[p["id"]] = p
    m = score_records(gts, preds)
    m["run"] = run
    m["corpus_hash"] = manifest.get("corpus_hash")
    (run_dir / "metrics.json").write_text(json.dumps(m, ensure_ascii=False, indent=1))
    return m
