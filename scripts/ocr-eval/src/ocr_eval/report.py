"""Human-readable outputs: worst-error gallery per run, and engine summary tables."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from PIL import Image
from rapidfuzz.distance import Levenshtein

from .gates import pct
from .metrics.match import match
from .metrics.normalize import normalize

PAD = 6


def _cell(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ") or "∅"


def errors_md(run_dir: Path, corpus_dir: Path, top: int = 30) -> Path:
    run_dir, corpus_dir = Path(run_dir), Path(corpus_dir)
    preds = {}
    for line in (run_dir / "predictions.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            d = json.loads(line)
            preds[d["id"]] = d
    manifest = json.loads((corpus_dir / "manifest.json").read_text())
    rows, subs = [], Counter()
    for sid in manifest["files"]:
        gt = json.loads((corpus_dir / f"{sid}.json").read_text(encoding="utf-8"))
        for c in match(gt["fragments"], preds.get(sid, {"lines": []})["lines"]):
            if not c.gt_idx:
                continue
            g, p = normalize(c.gt_text), normalize(c.pred_text)
            e = Levenshtein.distance(g, p)
            for tag, i1, i2, j1, j2 in Levenshtein.opcodes(g, p):
                if tag != "equal":
                    subs[(g[i1:i2], p[j1:j2])] += 1
            if e:
                boxes = [gt["fragments"][i]["box"] for i in c.gt_idx]
                rows.append((e, sid, gt, boxes, c.gt_text, c.pred_text))
    rows.sort(key=lambda r: -r[0])
    crops = run_dir / "crops"
    crops.mkdir(exist_ok=True)
    out = [f"# Worst errors — {run_dir.name}", "",
           "| # | edits | image | template · font · css · dpr · theme | ground truth | engine | crop |",
           "|---|---|---|---|---|---|---|"]
    for k, (e, sid, gt, boxes, gtext, ptext) in enumerate(rows[:top]):
        x0 = max(0, min(b[0] for b in boxes) - PAD)
        y0 = max(0, min(b[1] for b in boxes) - PAD)
        x1 = min(gt["width"], max(b[0] + b[2] for b in boxes) + PAD)
        y1 = min(gt["height"], max(b[1] + b[3] for b in boxes) + PAD)
        name = f"{k:02d}-{sid}.png"
        with Image.open(corpus_dir / f"{sid}.png") as im:
            im.crop((x0, y0, x1, y1)).save(crops / name)
        meta = f"{gt.get('template')} · {gt.get('font')} · {gt.get('css_px')} · {gt.get('dpr')} · {gt.get('theme')}"
        out.append(f"| {k} | {e} | {sid} | {meta} | {_cell(gtext)} | {_cell(ptext)} | ![](crops/{name}) |")
    out += ["", "## Most frequent edits (normalized text)", "", "| GT → engine | count |", "|---|---|"]
    for (a, b), n in subs.most_common(20):
        out.append(f"| {_cell(a)} → {_cell(b)} | {n} |")
    path = run_dir / "errors.md"
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return path


ROWS = [("all", None, None), ("thai", "category", "thai"), ("english", "category", "english"),
        ("mixed", "category", "mixed"), ("mac_typical·mixed", "mac_typical", "mixed"),
        ("win_typical·mixed", "win_typical", "mixed")]


def summary_md(runs: dict[str, dict]) -> str:
    head = "| engine | " + " | ".join(r[0] for r in ROWS) + " | fp/1k | p50 ms |"
    out = [head, "|" + "---|" * (len(ROWS) + 3)]
    for name, m in runs.items():
        cells = []
        for _, sl, v in ROWS:
            cer = m["overall"]["cer"] if sl is None else m["slices"].get(sl, {}).get(v, {}).get("cer")
            cells.append(pct(cer))
        lat = m.get("latency", {}).get("p50_ms")
        out.append(f"| {name} | " + " | ".join(cells) + f" | {m['overall']['fp_per_1k']:.1f} | "
                   + (f"{lat:.0f}" if lat is not None else "—") + " |")
    return "\n".join(out)
