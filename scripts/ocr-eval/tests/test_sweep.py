from ocr_eval import sweep


def fake_metrics(cer, slices=None):
    return {"run_id": f"fake-{cer}", "overall": {"cer": cer, "cer_e2e": cer},
            "slices": {"category_dpr": slices or {"mixed@2.0": {"cer": cer}}, "category": {}}}


def make_eval(table, calls):
    """table: {(knob, value): metrics}; unknown configs score like the base."""
    def ev(cfg):
        calls.append(cfg)
        for (k, v), m in table.items():
            if sweep.get_knob(cfg, k) == v:
                return m
        return fake_metrics(0.050)
    return ev


def test_descent_accepts_only_over_threshold(tmp_path):
    calls = []
    table = {("det.limit", 1600): fake_metrics(0.049),  # 0.1 pt better: not enough
             ("rec.color", "gray"): fake_metrics(0.047)}  # 0.3 pt better: adopt
    best = sweep.coordinate_descent({"det.limit": [1280, 1600], "rec.color": ["flatten", "gray"]},
                                    {"det": {"limit": 1280}, "rec": {"color": "flatten"}},
                                    evaluate=make_eval(table, calls), log=tmp_path / "it.md",
                                    out=tmp_path / "sweep.json")
    assert sweep.get_knob(best, "det.limit") == 1280
    assert sweep.get_knob(best, "rec.color") == "gray"


def test_descent_rejects_slice_regression(tmp_path):
    calls = []
    bad = fake_metrics(0.045, {"mixed@2.0": {"cer": 0.03}, "thai@1.0": {"cer": 0.08}})
    base = fake_metrics(0.050, {"mixed@2.0": {"cer": 0.05}, "thai@1.0": {"cer": 0.068}})
    ev = make_eval({("det.limit", 1600): bad}, calls)

    def ev2(cfg):
        return base if sweep.get_knob(cfg, "det.limit") == 1280 else ev(cfg)

    best = sweep.coordinate_descent({"det.limit": [1280, 1600]}, {"det": {"limit": 1280}}, evaluate=ev2,
                                    log=tmp_path / "it.md", out=tmp_path / "sweep.json")
    assert sweep.get_knob(best, "det.limit") == 1280


def test_budget_respected(tmp_path):
    calls = []
    knobs = {"det.limit": [960, 1280, 1600, 1920, 2560, 0], "det.unclip": [1.4, 1.5, 1.7, 2.0]}
    sweep.coordinate_descent(knobs, {"det": {"limit": 1280, "unclip": 1.4}}, evaluate=make_eval({}, calls),
                             budget=4, log=tmp_path / "it.md", out=tmp_path / "sweep.json")
    assert len(calls) <= 4


def test_log_has_every_evaluation(tmp_path):
    calls = []
    sweep.coordinate_descent({"det.limit": [1280, 1600, 1920]}, {"det": {"limit": 1280}},
                             evaluate=make_eval({}, calls), log=tmp_path / "it.md", out=tmp_path / "sweep.json")
    text = (tmp_path / "it.md").read_text()
    assert text.count("\n| ") >= len(calls) + 1  # header row + one row per evaluation
