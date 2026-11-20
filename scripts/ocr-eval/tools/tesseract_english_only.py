"""H1 diagnosis: Tesseract's CER on the `easy` slice split into English-only components it
detected vs whole lines it missed. Usage: uv run python tools/tesseract_english_only.py RUN..."""
import json
import sys

from rapidfuzz.distance import Levenshtein

from ocr_eval import paths
from ocr_eval.metrics.match import match
from ocr_eval.metrics.normalize import normalize
from ocr_eval.metrics.score import category, composites

for run in sys.argv[1:]:
    rd = paths.RUNS / run
    split = json.load(open(rd / "run.json"))["split"]
    cd = paths.corpus_dir(split)
    preds = {json.loads(line)["id"]: json.loads(line) for line in open(rd / "predictions.jsonl")}
    E = N = M = 0
    for sid in json.load(open(cd / "manifest.json"))["files"]:
        gt = json.load(open(cd / f"{sid}.json"))
        if "easy" not in composites(gt):
            continue
        for c in match(gt["fragments"], preds[sid]["lines"]):
            if not c.gt_idx or not all(category(gt["fragments"][i]["text"]) == "english" for i in c.gt_idx):
                continue
            g, p = normalize(c.gt_text), normalize(c.pred_text)
            if c.pred_idx:
                E += Levenshtein.distance(g, p)
                N += len(g)
            else:
                M += len(g)
    print(f"{run}: read CER {100 * E / max(N, 1):.2f}% over {N} chars; wholly missed {M} chars")
