from ocr_eval.metrics.match import match


def F(text, x, y, w, h):
    return {"text": text, "box": [x, y, w, h]}


def test_match_merged_cells():
    gt = [F("ราคา", 10, 10, 60, 20), F("1,250", 200, 10, 50, 20)]
    pred = [F("ราคา 1,250", 8, 9, 245, 22)]
    comps = match(gt, pred)
    assert len(comps) == 1
    c = comps[0]
    assert sorted(c.gt_idx) == [0, 1] and c.pred_idx == [0]
    assert c.gt_text.replace(" ", "") == c.pred_text.replace(" ", "") == "ราคา1,250"


def test_match_neighbor_columns_not_linked():
    gt = [F("left", 0, 0, 100, 20), F("right", 98, 0, 100, 20)]
    pred = [F("left", 0, 0, 100, 20), F("right", 98, 0, 100, 20)]
    comps = match(gt, pred)
    assert len(comps) == 2
    assert {c.gt_text for c in comps} == {"left", "right"}


def test_unmatched_gt_is_own_component():
    gt = [F("hello", 0, 0, 100, 20), F("missing", 0, 100, 100, 20)]
    pred = [F("hello", 0, 0, 100, 20)]
    comps = match(gt, pred)
    miss = [c for c in comps if not c.pred_idx]
    assert len(miss) == 1 and miss[0].gt_text == "missing"


def test_unmatched_pred_is_fp_component():
    gt = [F("hello", 0, 0, 100, 20)]
    pred = [F("hello", 0, 0, 100, 20), F("☺", 500, 500, 20, 20)]
    comps = match(gt, pred)
    fp = [c for c in comps if not c.gt_idx]
    assert len(fp) == 1 and fp[0].pred_text == "☺"


def test_vertical_overlap_required():
    # same x range, different rows: must not link
    gt = [F("row one", 0, 0, 100, 20)]
    pred = [F("row two", 0, 18, 100, 20)]
    comps = match(gt, pred)
    assert len(comps) == 2
