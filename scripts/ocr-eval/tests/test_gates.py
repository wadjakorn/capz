import json

from ocr_eval import gates


def M(cer=0.03, slices=None, recall=None, per_image=None, fp=0.0):
    """A metrics.json-shaped dict with just what gates read."""
    base = {"overall": {"cer": cer, "fp_per_1k": fp, "n_chars": 1000},
            "slices": slices or {}, "class_recall": {"all": {}, "mixed": recall or {}},
            "per_image": per_image or {str(i): {"edits": round(cer * 100), "n": 100, "fp": 0} for i in range(10)}}
    return base


def S(cer):
    return {"cer": cer, "n_chars": 500}


def test_thresholds_match_plan():
    assert gates.THRESHOLDS == {
        "H1_tesseract_easy_english": 0.03, "H1_vision_easy_english": 0.02, "H2_coverage": 0.995,
        "A1_max_delta": 0.003, "Q1a_mixed": 0.05, "Q1b_ratio": 1.5, "Q1b_slack": 0.005,
        "Q1c_latin": 0.97, "Q1c_digit": 0.97, "Q1c_tone": 0.95, "Q1c_vowel_above": 0.95,
        "W1_rel_reduction": 0.20, "W2_english_slack": 0.01, "W2_fp_slack": 5.0,
        "R1_max_delta": 0.003, "R1_identical": 0.95,
        "P1_p50_ms": 1000, "P1_p95_ms": 2000, "P1_cold_ms": 2500, "P1_rss_mb": 400,
        "S1_added_mb": 12.0, "overfit_pt": 0.02,
    }


def test_q1a_fails_when_one_slice_over():
    ot = M(slices={"mac_typical": {"mixed": S(0.04)}, "win_typical": {"mixed": S(0.055)}})
    g = gates.q1a(ot)
    assert g["status"] == "FAIL" and "win_typical" in g["why"]
    ok = gates.q1a(M(slices={"mac_typical": {"mixed": S(0.04)}, "win_typical": {"mixed": S(0.049)}}))
    assert ok["status"] == "PASS"


def test_q1b_ratio():
    sl = {"category": {"mixed": S(0.05), "thai": S(0.03), "english": S(0.02)}}
    assert gates.q1b(M(slices=sl))["status"] == "PASS"  # 0.05 <= 1.5*0.03+0.005
    sl["category"]["mixed"] = S(0.051)
    assert gates.q1b(M(slices=sl))["status"] == "FAIL"


def test_q1c_needs_every_class():
    rec = {c: {"recall": 0.99, "total": 50} for c in ("latin_upper", "latin_lower", "digit", "thai_tone",
                                                      "thai_vowel_above")}
    assert gates.q1c(M(recall=rec))["status"] == "PASS"
    rec["thai_tone"] = {"recall": 0.94, "total": 50}
    g = gates.q1c(M(recall=rec))
    assert g["status"] == "FAIL" and "thai_tone" in g["why"]


def test_w1_requires_ci_excluding_zero():
    ot = M(cer=0.30, per_image={**{str(i): {"edits": 0, "n": 100, "fp": 0} for i in range(9)},
                                "9": {"edits": 300, "n": 100, "fp": 0}})
    tess = M(cer=0.40, per_image={str(i): {"edits": 40, "n": 100, "fp": 0} for i in range(10)})
    g = gates.w1(ot, tess)
    assert g["status"] == "FAIL" and "CI" in g["why"]
    ot2 = M(cer=0.10, per_image={str(i): {"edits": 10, "n": 100, "fp": 0} for i in range(10)})
    assert gates.w1(ot2, tess)["status"] == "PASS"


def test_missing_vision_is_skipped():
    tess = M(slices={"easy": {"english": S(0.02)}})
    g = gates.h1(tess, None)
    assert g["status"] == "PASS" and "vision" not in g["value"]
    assert gates.m1(M(), None)["status"] == "SKIPPED"


def test_missing_perf_and_size_are_skipped():
    assert gates.p1(None)["status"] == "SKIPPED"
    assert gates.s1(None)["status"] == "SKIPPED"


def test_p1_all_hosts_must_pass(tmp_path):
    p = tmp_path / "perf.json"
    p.write_text(json.dumps({"linux": {"p50_ms": 800, "p95_ms": 1500, "cold_ms": 2000, "rss_mb": 300},
                             "mac": {"p50_ms": 1200, "p95_ms": 1500, "cold_ms": 2000, "rss_mb": 300}}))
    g = gates.p1(p)
    assert g["status"] == "FAIL" and "mac" in g["why"]


def test_r1_parity_counts_identical_lines():
    a = {"x": {"lines": [{"text": "กด Save", "box": [0, 0, 100, 20]}, {"text": "ok", "box": [0, 50, 40, 20]}]}}
    b = {"x": {"lines": [{"text": "กด  Save", "box": [1, 0, 100, 20]}, {"text": "0k", "box": [0, 50, 40, 20]}]}}
    assert gates.identical_share(a, b) == 0.5


def test_write_final_scrubs_hostnames(tmp_path, monkeypatch):
    import socket

    from ocr_eval import paths, pipeline

    runs, ev = tmp_path / "runs", tmp_path / "ev"
    (runs / "r1").mkdir(parents=True)
    me = socket.gethostname()
    (runs / "r1" / "metrics.json").write_text(json.dumps({**M(), "run": {"host": me}}))
    (runs / "perf.json").write_text(json.dumps({"x": {"host": "macbook-pro", "p50_ms": 1}}))
    monkeypatch.setattr(paths, "RUNS", runs)
    monkeypatch.setattr(paths, "EVIDENCE", ev)
    pipeline.write_final({"gates": {}, "warnings": [], "roles": {"ot_test": "r1"}})
    for f in ev.iterdir():
        text = f.read_text()
        assert me not in text and "macbook-pro" not in text, f.name
