"""Every engine adapter must return boxes in the input image's pixel space.
A wrong coordinate transform shows up as a missed line here, not as a quietly
worse CER later (Review Focus 3)."""
import pytest

from conftest import KNOWN_TEXT, iou
from ocr_eval.engines import ENGINES
from ocr_eval.metrics.match import match
from ocr_eval.metrics.normalize import normalize

ENGINE_CONFIGS = {"openthai": {"runtime": {"backend": "onnxruntime"}}, "tesseract": {}, "vision": {},
                  "rust-ort": {}, "rust-tract": {}}


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
    # Reading quality is what the eval measures, not this test: only require that the
    # adapter returned the engine's text for the right place. (Vision reads this very
    # line as "Hello абай 123" — Cyrillic — with capz's own settings; a finding, not a bug.)
    g = normalize(KNOWN_TEXT)
    assert normalize(comps[0].pred_text)[:5] == g[:5], comps[0].pred_text


def test_pre_scale_boxes_in_input_coords(known_line):
    path, _ = known_line
    ot = _engine("openthai")
    a = ot.recognize([("known", path)], {"runtime": {"backend": "onnxruntime"}})["known"]["lines"]
    b = ot.recognize([("known", path)], {"runtime": {"backend": "onnxruntime"}, "pre": {"scale": 2.0}})["known"]["lines"]
    assert len(a) == len(b) == 1
    assert all(abs(x - y) <= 4 for x, y in zip(a[0]["box"], b[0]["box"])), (a[0]["box"], b[0]["box"])


def test_tesseract_upscale_factor_matches_pr84():
    from ocr_eval.engines.tesseract import upscale_factor

    assert upscale_factor(800, 600) == 3.0
    assert upscale_factor(1248, 1828) == 4000 / 1828
    assert upscale_factor(5000, 100) == 1.0
    assert upscale_factor(0, 0) == 1.0


TSV_HEADER = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext"


def test_parse_tsv_groups_lines_and_unscales():
    from ocr_eval.engines.tesseract import parse_tsv

    rows = [TSV_HEADER,
            "4\t1\t1\t1\t1\t0\t10\t10\t300\t40\t-1\t",
            "5\t1\t1\t1\t1\t1\t10\t10\t100\t40\t91\tกด",
            "5\t1\t1\t1\t1\t2\t120\t12\t190\t36\t90\tSave",
            "5\t1\t1\t1\t2\t1\t10\t80\t200\t40\t88\tค\u0e4d\u0e32นวณ",
            "5\t1\t1\t1\t2\t2\t220\t80\t20\t40\t-1\t "]
    lines = parse_tsv("\n".join(rows), scale=2.0)
    assert [ln["text"] for ln in lines] == ["กด Save", "คำนวณ"]
    assert lines[0]["box"] == [5.0, 5.0, 150.0, 20.0]
    assert lines[1]["box"] == [5.0, 40.0, 100.0, 20.0]
