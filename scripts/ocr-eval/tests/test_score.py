import json

import pytest

from ocr_eval.metrics.bootstrap import paired_bootstrap
from ocr_eval.metrics.normalize import normalize
from ocr_eval.metrics.score import score_records, score_run


def GT(id_, frags, **meta):
    base = dict(id=id_, template="chat", font="sarabun", css_px=14, dpr=2.0, theme="light", crop="viewport",
                width=1000, height=1000)
    base.update(meta)
    return dict(base, fragments=[{"text": t, "box": b} for t, b in frags])


def P(id_, lines):
    return {"id": id_, "width": 1000, "height": 1000, "elapsed_ms": 10.0,
            "lines": [{"text": t, "box": b} for t, b in lines]}


def test_perfect_prediction_zero_cer():
    g = GT("a", [("กด Save เพื่อบันทึก", [0, 0, 300, 30])])
    m = score_records([g], {"a": P("a", [("กด Save เพื่อบันทึก", [0, 0, 300, 30])])})
    assert m["overall"]["cer"] == 0.0
    assert m["slices"]["category"]["mixed"]["cer"] == 0.0


def test_unmatched_gt_full_deletion():
    g = GT("a", [("hello", [0, 0, 100, 20]), ("missing", [0, 100, 100, 20])])
    m = score_records([g], {"a": P("a", [("hello", [0, 0, 100, 20])])})
    assert m["overall"]["edits"] == len(normalize("missing"))
    assert m["overall"]["n_chars"] == len("hello") + len("missing")


def test_missing_prediction_counts_as_empty():
    g = GT("a", [("hello", [0, 0, 100, 20])])
    m = score_records([g], {})
    assert m["overall"]["cer"] == 1.0
    assert m["failed_images"] == ["a"]


def test_fp_counted():
    g = GT("a", [("hello", [0, 0, 100, 20])])
    m = score_records([g], {"a": P("a", [("hello", [0, 0, 100, 20]), ("☺", [500, 500, 20, 20])])})
    assert m["overall"]["cer"] == 0.0
    assert m["overall"]["fp"] == 1
    assert m["overall"]["fp_per_1k"] > 0
    assert m["overall"]["cer_e2e"] == pytest.approx(1 / 5)


def test_class_recall_tone():
    g = GT("a", [("ที่", [0, 0, 50, 20])])
    m = score_records([g], {"a": P("a", [("ที", [0, 0, 50, 20])])})
    cr = m["class_recall"]["all"]
    assert cr["thai_tone"]["recall"] == 0.0
    assert cr["thai_cons"]["recall"] == 1.0


def test_composite_slices_present():
    mac = GT("m", [("กด Save", [0, 0, 100, 20])], dpr=2.0, css_px=14, theme="dark")
    win = GT("w", [("กด Save", [0, 0, 100, 20])], dpr=1.25, css_px=12, theme="light")
    easy = GT("e", [("Settings", [0, 0, 100, 20])], dpr=2.0, css_px=20, theme="light")
    preds = {k: P(k, [("กด Save", [0, 0, 100, 20])]) for k in ("m", "w")}
    preds["e"] = P("e", [("Settngs", [0, 0, 100, 20])])
    m = score_records([mac, win, easy], preds)
    assert m["slices"]["mac_typical"]["mixed"]["n_chars"] == 6
    assert m["slices"]["win_typical"]["mixed"]["n_chars"] == 6
    assert m["slices"]["easy"]["english"]["cer"] == pytest.approx(1 / 8)
    assert "mixed@2.0" in m["slices"]["category_dpr"]


def test_bootstrap_identical_runs():
    g = [GT(str(i), [("hello", [0, 0, 100, 20])]) for i in range(5)]
    m = score_records(g, {str(i): P(str(i), [("hallo", [0, 0, 100, 20])]) for i in range(5)})
    assert paired_bootstrap(m, m) == (0.0, 0.0, 0.0)


def test_bootstrap_detects_consistent_gap():
    g = [GT(str(i), [("hello world", [0, 0, 200, 20])]) for i in range(30)]
    good = score_records(g, {str(i): P(str(i), [("hello world", [0, 0, 200, 20])]) for i in range(30)})
    bad = score_records(g, {str(i): P(str(i), [("hallo warld", [0, 0, 200, 20])]) for i in range(30)})
    d, lo, hi = paired_bootstrap(bad, good)
    assert d > 0 and lo > 0


def test_score_run_reads_files(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    g = GT("a", [("hello", [0, 0, 100, 20])])
    (corpus / "a.json").write_text(json.dumps(g))
    (corpus / "manifest.json").write_text(json.dumps({"files": {"a": {}}}))
    run = tmp_path / "run"
    run.mkdir()
    (run / "run.json").write_text(json.dumps({"engine": "x", "split": "dev", "config": {}}))
    (run / "predictions.jsonl").write_text(json.dumps(P("a", [("hello", [0, 0, 100, 20])])) + "\n")
    m = score_run(run, corpus)
    assert m["overall"]["cer"] == 0.0
    assert json.loads((run / "metrics.json").read_text())["overall"]["cer"] == 0.0


def test_compare_md_has_delta_and_ci():
    from ocr_eval.metrics.compare import compare_md

    g = [GT(str(i), [("hello world", [0, 0, 200, 20])]) for i in range(10)]
    a = score_records(g, {str(i): P(str(i), [("hallo world", [0, 0, 200, 20])]) for i in range(10)})
    b = score_records(g, {str(i): P(str(i), [("hello world", [0, 0, 200, 20])]) for i in range(10)})
    md = compare_md(a, b, "A", "B")
    assert "| overall |" in md and "Δ" in md and "CI" in md


def test_score_run_rejects_stale_corpus(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "a.json").write_text(json.dumps(GT("a", [("hello", [0, 0, 100, 20])])))
    (corpus / "manifest.json").write_text(json.dumps({"files": {"a": {}}, "corpus_hash": "new"}))
    run = tmp_path / "run"
    run.mkdir()
    (run / "run.json").write_text(json.dumps({"engine": "x", "split": "dev", "config": {}, "corpus_hash": "old"}))
    (run / "predictions.jsonl").write_text(json.dumps(P("a", [("hello", [0, 0, 100, 20])])) + "\n")
    with pytest.raises(ValueError, match="stale"):
        score_run(run, corpus)


def test_category_denominators_do_not_depend_on_segmentation():
    """A Thai cell and an English cell read as one line (merged) or two lines (split)
    must give the same per-category n_chars, and an error in the English cell must be
    charged to `english` only."""
    g = GT("a", [("ราคาสินค้า", [0, 0, 100, 20]), ("Total", [150, 0, 60, 20])])
    merged = score_records([g], {"a": P("a", [("ราคาสินค้า Tatal", [0, 0, 210, 20])])})
    split = score_records([g], {"a": P("a", [("ราคาสินค้า", [0, 0, 100, 20]), ("Tatal", [150, 0, 60, 20])])})
    for m in (merged, split):
        cat = m["slices"]["category"]
        assert cat["thai"]["n_chars"] == len("ราคาสินค้า") and cat["thai"]["edits"] == 0
        assert cat["english"]["n_chars"] == 5 and cat["english"]["edits"] == 1
        assert "mixed" not in cat
