from ocr_eval import perf, size


def test_parse_rss_linux_time_v():
    out = "\tCommand being timed: \"x\"\n\tMaximum resident set size (kbytes): 204800\n\tExit status: 0\n"
    assert perf.parse_rss_mb(out) == 200.0


def test_parse_rss_macos_time_l():
    out = "        1.23 real         0.50 user\n           209715200  maximum resident set size\n"
    assert perf.parse_rss_mb(out) == 200.0


def test_added_mb_is_backend_delta_plus_models():
    sizes = {"none_zip": 1_000_000, "ort_zip": 9_000_000, "tract_zip": 4_000_000, "models_zip": 3_000_000}
    assert size.added_mb(sizes, "ort") == round((9_000_000 - 1_000_000 + 3_000_000) / 1e6, 2)
    assert size.added_mb(sizes, "tract") == round((4_000_000 - 1_000_000 + 3_000_000) / 1e6, 2)


def test_summarize_scores_the_recommended_backend_not_the_smallest():
    sizes = {"none_zip": 1_000_000, "ort_zip": 9_000_000, "tract_zip": 4_000_000, "models_zip": 3_000_000}
    out = size.summarize({"linux": sizes}, backend="ort")
    assert out["targets"]["linux"]["added_zip_mb"] == size.added_mb(sizes, "ort")
    assert out["targets"]["linux"]["backend"] == "ort"


def test_windows_estimate_has_provenance():
    est = size.windows_estimate(none_zip=210_000, models_zip=3_780_000)
    assert est["estimate"] is True and est["backend"] == "ort"
    assert est["added_zip_mb"] == round(5.25 + 0.21 + 3.78, 2)
    assert "onnxruntime.dll" in est["basis"]


def test_run_records_a_host_label_not_the_hostname(tmp_path, monkeypatch):
    import json
    import socket

    from ocr_eval import paths
    from ocr_eval.engines import base

    corpus = tmp_path / "corpus" / "x"
    corpus.mkdir(parents=True)
    (corpus / "manifest.json").write_text(json.dumps({"files": {}, "corpus_hash": "h"}))
    monkeypatch.setattr(paths, "corpus_dir", lambda split: corpus)
    monkeypatch.setattr(paths, "RUNS", tmp_path / "runs")
    d = base.new_run("e", {}, "x")
    host = json.loads((d / "run.json").read_text())["host"]
    assert socket.gethostname() not in host and host == base.host_label()
