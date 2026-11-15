"""Every engine adapter must return boxes in the input image's pixel space.
A wrong coordinate transform shows up as a missed line here, not as a quietly
worse CER later (Review Focus 3)."""
import pytest

from conftest import KNOWN_TEXT, iou
from ocr_eval.engines import ENGINES
from ocr_eval.metrics.match import match
from ocr_eval.metrics.normalize import normalize
from rapidfuzz.distance import Levenshtein

ENGINE_CONFIGS = {"openthai": {"runtime": {"backend": "onnxruntime"}}}


def _engine(name):
    mod = ENGINES[name]
    if hasattr(mod, "available") and not mod.available():
        pytest.skip(f"{name} not available on this host")
    return mod


@pytest.mark.parametrize("name", sorted(ENGINE_CONFIGS))
def test_known_line_matches(name, known_line):
    path, gt = known_line
    preds = _engine(name).recognize([("known", path)], ENGINE_CONFIGS[name])
    lines = preds["known"]["lines"]
    comps = [c for c in match(gt["fragments"], lines) if c.gt_idx]
    assert len(comps) == 1 and comps[0].pred_idx, lines
    best = max(iou(gt["fragments"][0]["box"], lines[j]["box"]) for j in comps[0].pred_idx)
    assert best >= 0.5, (gt["fragments"][0]["box"], lines)
    g = normalize(KNOWN_TEXT)
    assert Levenshtein.distance(g, normalize(comps[0].pred_text)) / len(g) <= 0.1, comps[0].pred_text


def test_pre_scale_boxes_in_input_coords(known_line):
    path, _ = known_line
    ot = _engine("openthai")
    a = ot.recognize([("known", path)], {"runtime": {"backend": "onnxruntime"}})["known"]["lines"]
    b = ot.recognize([("known", path)], {"runtime": {"backend": "onnxruntime"}, "pre": {"scale": 2.0}})["known"]["lines"]
    assert len(a) == len(b) == 1
    assert all(abs(x - y) <= 4 for x, y in zip(a[0]["box"], b[0]["box"])), (a[0]["box"], b[0]["box"])
