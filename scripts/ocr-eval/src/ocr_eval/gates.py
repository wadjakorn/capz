"""Pre-registered gates (plan § Gates). The thresholds below are copied from the
plan and pinned by tests/test_gates.py::test_thresholds_match_plan — changing
one after seeing results is a deviation that must be argued in the report."""
from __future__ import annotations

import json
from pathlib import Path

from .metrics.bootstrap import paired_bootstrap
from .metrics.match import match
from .metrics.normalize import normalize

THRESHOLDS = {
    "H1_tesseract_easy_english": 0.03, "H1_vision_easy_english": 0.02, "H2_coverage": 0.995,
    "A1_max_delta": 0.003, "Q1a_mixed": 0.05, "Q1b_ratio": 1.5, "Q1b_slack": 0.005,
    "Q1c_latin": 0.97, "Q1c_digit": 0.97, "Q1c_tone": 0.95, "Q1c_vowel_above": 0.95,
    "W1_rel_reduction": 0.20, "W2_english_slack": 0.01, "W2_fp_slack": 5.0,
    "R1_max_delta": 0.003, "R1_identical": 0.95,
    "P1_p50_ms": 1000, "P1_p95_ms": 2000, "P1_cold_ms": 2500, "P1_rss_mb": 400,
    "S1_added_mb": 12.0, "overfit_pt": 0.02,
}
T = THRESHOLDS
EPS = 1e-9  # a value exactly on a threshold passes, whatever float rounding did to the limit


def _g(status: str, value, threshold, why: str, **extra) -> dict:
    return {"status": status, "value": value, "threshold": threshold, "why": why, **extra}


def _skip(why: str) -> dict:
    return _g("SKIPPED", None, None, why)


def _cer(m: dict, *path: str) -> float | None:
    cur = m["slices"]
    for p in path:
        cur = cur.get(p) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur.get("cer")


def pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.2f}%"


def h1(tess: dict | None, vision: dict | None) -> dict:
    if tess is None:
        return _skip("no tesseract run")
    value, fails = {}, []
    t = _cer(tess, "easy", "english")
    value["tesseract"] = t
    if t is None or t > T["H1_tesseract_easy_english"]:
        fails.append(f"tesseract easy·english {pct(t)} > {pct(T['H1_tesseract_easy_english'])}")
    if vision is not None:
        v = _cer(vision, "easy", "english")
        value["vision"] = v
        if v is None or v > T["H1_vision_easy_english"]:
            fails.append(f"vision easy·english {pct(v)} > {pct(T['H1_vision_easy_english'])}")
    return _g("FAIL" if fails else "PASS", value, {"tesseract": T["H1_tesseract_easy_english"],
                                                   "vision": T["H1_vision_easy_english"]},
              "; ".join(fails) or "both engines read large clean English as expected")


def h2(checks: dict[str, dict] | None) -> dict:
    if not checks:
        return _skip("no corpus check reports")
    bad = {s: c for s, c in checks.items() if not c["ok"] or c["coverage_min"] < T["H2_coverage"]}
    value = {s: {"coverage_min": c["coverage_min"], "n": c["n"], "determinism_checked": c["determinism_checked"],
                 "bad": len(c["bad"])} for s, c in checks.items()}
    return _g("FAIL" if bad else "PASS", value, T["H2_coverage"],
              f"failing splits: {sorted(bad)}" if bad else "every split's GT matches its pixels")


def a1(full: dict | None, ablated: dict | None) -> dict:
    if full is None or ablated is None:
        return _skip("need the full and ablated reference runs on dev")
    d, lo, hi = paired_bootstrap(full, ablated)
    ok = d <= T["A1_max_delta"]
    return _g("PASS" if ok else "FAIL", {"delta": d, "ci": [lo, hi]}, T["A1_max_delta"],
              f"CER(full) − CER(no ori, no split_gap) = {100 * d:+.2f} pt, CI [{100 * lo:+.2f}, {100 * hi:+.2f}]")


def q1a(ot: dict) -> dict:
    vals = {s: _cer(ot, s, "mixed") for s in ("mac_typical", "win_typical")}
    over = [f"{s}·mixed {pct(v)}" for s, v in vals.items() if v is None or v > T["Q1a_mixed"] + EPS]
    return _g("FAIL" if over else "PASS", vals, T["Q1a_mixed"],
              ("over " + pct(T["Q1a_mixed"]) + ": " + ", ".join(over)) if over else "both typical slices under 5%")


def q1b(ot: dict) -> dict:
    mixed, thai, eng = (_cer(ot, "category", c) for c in ("mixed", "thai", "english"))
    limit = T["Q1b_ratio"] * max(thai or 0, eng or 0) + T["Q1b_slack"]
    ok = mixed is not None and mixed <= limit + EPS
    return _g("PASS" if ok else "FAIL", {"mixed": mixed, "thai": thai, "english": eng}, limit,
              f"mixed {pct(mixed)} vs limit 1.5×max(thai {pct(thai)}, english {pct(eng)}) + 0.5 pt = {pct(limit)}")


def q1c(ot: dict) -> dict:
    rec = ot["class_recall"]["mixed"]
    need = {"latin_upper": T["Q1c_latin"], "latin_lower": T["Q1c_latin"], "digit": T["Q1c_digit"],
            "thai_tone": T["Q1c_tone"], "thai_vowel_above": T["Q1c_vowel_above"]}
    vals = {c: (rec.get(c) or {}).get("recall") for c in need}
    low = [f"{c} {pct(v)} < {pct(need[c])}" for c, v in vals.items() if v is None or v < need[c]]
    return _g("FAIL" if low else "PASS", vals, need, "; ".join(low) or "every class above its floor on mixed lines")


def w1(ot: dict, tess: dict | None) -> dict:
    if tess is None:
        return _skip("no tesseract run")
    a, b = ot["overall"]["cer"], tess["overall"]["cer"]
    rel = (b - a) / b if b else 0.0
    d, lo, hi = paired_bootstrap(ot, tess)
    ok = rel >= T["W1_rel_reduction"] and hi < 0
    why = (f"OpenThai {pct(a)} vs Tesseract {pct(b)}: {100 * rel:.1f}% lower; "
           f"ΔCER {100 * d:+.2f} pt, 95% CI [{100 * lo:+.2f}, {100 * hi:+.2f}]")
    if not ok and rel >= T["W1_rel_reduction"]:
        why += " — CI includes 0"
    return _g("PASS" if ok else "FAIL", {"rel_reduction": rel, "delta": d, "ci": [lo, hi]},
              T["W1_rel_reduction"], why)


def w2(ot: dict, tess: dict | None) -> dict:
    if tess is None:
        return _skip("no tesseract run")
    e_ot, e_t = _cer(ot, "category", "english"), _cer(tess, "category", "english")
    f_ot, f_t = ot["overall"]["fp_per_1k"], tess["overall"]["fp_per_1k"]
    fails = []
    if e_ot is None or e_t is None or e_ot > e_t + T["W2_english_slack"]:
        fails.append(f"english {pct(e_ot)} > Tesseract {pct(e_t)} + 1 pt")
    if f_ot > f_t + T["W2_fp_slack"]:
        fails.append(f"fp/1k {f_ot:.1f} > Tesseract {f_t:.1f} + 5")
    return _g("FAIL" if fails else "PASS", {"english": [e_ot, e_t], "fp_per_1k": [f_ot, f_t]},
              {"english_slack": T["W2_english_slack"], "fp_slack": T["W2_fp_slack"]},
              "; ".join(fails) or f"english {pct(e_ot)} vs {pct(e_t)}; fp/1k {f_ot:.1f} vs {f_t:.1f}")


def m1(ot: dict, vision: dict | None) -> dict:
    if vision is None:
        return _skip("no vision run")
    d, lo, hi = paired_bootstrap(ot, vision)
    same = lo <= 0
    return _g("PASS" if same else "FAIL", {"delta": d, "ci": [lo, hi]}, "ΔCER CI includes or is below 0",
              (f"OpenThai {pct(ot['overall']['cer'])} vs Vision {pct(vision['overall']['cer'])}, ΔCER "
               f"{100 * d:+.2f} pt CI [{100 * lo:+.2f}, {100 * hi:+.2f}] → "
               + ("equivalent or better" if same else "keep Vision")), informational=True)


def identical_share(a: dict[str, dict], b: dict[str, dict]) -> float:
    """Share of run A's lines whose geometrically matched run-B text is identical after normalize."""
    same = total = 0
    for pid, pa in a.items():
        pb = b.get(pid, {"lines": []})
        for c in match(pa["lines"], pb["lines"]):
            if not c.gt_idx:
                continue
            total += 1
            same += normalize(c.gt_text) == normalize(c.pred_text)
    return same / total if total else 0.0


def r1(rust: dict | None, py: dict | None, rust_preds: dict | None, py_preds: dict | None) -> dict:
    if rust is None or py is None:
        return _skip("need a rust-proto run and the Python run with the same config")
    d = rust["overall"]["cer"] - py["overall"]["cer"]
    share = identical_share(py_preds, rust_preds) if py_preds and rust_preds else 0.0
    ok = abs(d) <= T["R1_max_delta"] and share >= T["R1_identical"]
    return _g("PASS" if ok else "FAIL", {"delta": d, "identical_share": share},
              {"max_delta": T["R1_max_delta"], "identical": T["R1_identical"]},
              f"ΔCER rust−python {100 * d:+.2f} pt; identical lines {100 * share:.1f}%")


def p1(perf_path: Path | None) -> dict:
    if perf_path is None or not Path(perf_path).exists():
        return _skip("no perf.json")
    perf = json.loads(Path(perf_path).read_text())
    lim = {"p50_ms": T["P1_p50_ms"], "p95_ms": T["P1_p95_ms"], "cold_ms": T["P1_cold_ms"], "rss_mb": T["P1_rss_mb"]}
    fails = [f"{host} {k} {v[k]:.0f} > {lim[k]}" for host, v in perf.items() for k in lim if v.get(k) is None
             or v[k] > lim[k]]
    return _g("FAIL" if fails else "PASS", perf, lim, "; ".join(fails) or "every host within limits")


def s1(size_path: Path | None) -> dict:
    if size_path is None or not Path(size_path).exists():
        return _skip("no size.json")
    size = json.loads(Path(size_path).read_text())
    added = {t: v["added_zip_mb"] for t, v in size["targets"].items()}
    over = [f"{t} {mb:.1f} MB" for t, mb in added.items() if mb > T["S1_added_mb"]]
    return _g("FAIL" if over else "PASS", added, T["S1_added_mb"],
              ("over 12 MB: " + ", ".join(over)) if over else "every target adds ≤ 12 MB")


def overfit_warning(dev: dict | None, test: dict | None) -> str | None:
    if dev is None or test is None:
        return None
    d = test["overall"]["cer"] - dev["overall"]["cer"]
    if abs(d) > T["overfit_pt"]:
        return f"OpenThai best config: test CER differs from dev by {100 * d:+.2f} pt (> 2 pt) — possible overfit"
    return None
