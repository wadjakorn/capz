import json

from PIL import Image

from ocr_eval import report


def test_errors_md_writes_crops(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    Image.new("RGB", (400, 200), "white").save(corpus / "a.png")
    gt = {"id": "a", "template": "chat", "font": "sarabun", "css_px": 14, "dpr": 2.0, "theme": "light",
          "crop": "viewport", "width": 400, "height": 200,
          "fragments": [{"text": "ที่นี่", "box": [10, 10, 100, 30]}, {"text": "Save", "box": [10, 100, 80, 30]}]}
    (corpus / "a.json").write_text(json.dumps(gt))
    (corpus / "manifest.json").write_text(json.dumps({"files": {"a": {}}}))
    run = tmp_path / "run"
    run.mkdir()
    (run / "run.json").write_text(json.dumps({"engine": "x", "split": "dev", "config": {}}))
    pred = {"id": "a", "lines": [{"text": "ทีนี", "box": [10, 10, 100, 30]}, {"text": "Save", "box": [10, 100, 80, 30]}]}
    (run / "predictions.jsonl").write_text(json.dumps(pred, ensure_ascii=False) + "\n")
    md = report.errors_md(run, corpus, top=5)
    text = md.read_text(encoding="utf-8")
    assert "ที่นี่" in text and "ทีนี" in text
    crops = list((run / "crops").glob("*.png"))
    assert len(crops) == 1
    assert crops[0].name in text
    assert "| ่ → ∅ |" in text or "่ → ∅" in text  # substitution table names the dropped tone mark


def test_summary_md_rows():
    m = {"overall": {"cer": 0.05, "fp_per_1k": 1.0}, "slices": {"category": {"mixed": {"cer": 0.04}}},
         "latency": {"p50_ms": 500}}
    md = report.summary_md({"openthai": m})
    assert "| openthai |" in md and "5.00%" in md and "4.00%" in md
