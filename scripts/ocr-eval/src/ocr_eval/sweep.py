"""Coordinate descent over OpenThai knobs on the dev split (plan Task 7).

One knob at a time, others fixed at the current best. A value is adopted only
if dev CER_e2e improves by >= MIN_GAIN and no (category × dpr) slice gets
worse by more than MAX_SLICE_LOSS. Every evaluation is appended to the
iterations log as it happens, so a crash loses nothing."""
from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path
from typing import Callable

MIN_GAIN = 0.002  # 0.2 pt
MAX_SLICE_LOSS = 0.01  # 1.0 pt

KNOBS = {
    "det.limit": [960, 1280, 1600, 1920, 2560, 0],
    "pre.scale": [1.0, 1.5, 2.0],
    "rec.color": ["flatten", "stretch", "gray_inv", "gray"],
    "det.v_pad": [0.0, 0.15, 0.3],
    "det.box_thresh": [0.4, 0.5, 0.6],
    "det.unclip": [1.4, 1.5, 1.7, 2.0],
    "det.thresh": [0.2, 0.3],
    "rec.drop_below": [0.0, 0.5, 0.8],
    "rec.min_chars": [1, 2],
}
# what B0 resolves to (REFERENCE.md "Effective configuration"); a knob absent from
# the config is at this value
EFFECTIVE_DEFAULTS = {"det.limit": 1280, "pre.scale": 1.0, "rec.color": "flatten", "det.v_pad": 0.0,
                      "det.box_thresh": 0.4, "det.unclip": 1.4, "det.thresh": 0.2, "rec.drop_below": 0.8,
                      "rec.min_chars": 2}


def get_knob(cfg: dict, knob: str):
    sec, key = knob.split(".", 1)
    return cfg.get(sec, {}).get(key, EFFECTIVE_DEFAULTS.get(knob))


def set_knob(cfg: dict, knob: str, value) -> dict:
    out = copy.deepcopy(cfg)
    sec, key = knob.split(".", 1)
    out.setdefault(sec, {})[key] = value
    return out


def _slice_regression(cand: dict, best: dict) -> tuple[str, float] | None:
    worst = None
    cb = best["slices"].get("category_dpr", {})
    for k, v in cand["slices"].get("category_dpr", {}).items():
        if k in cb:
            loss = v["cer"] - cb[k]["cer"]
            if loss > MAX_SLICE_LOSS and (worst is None or loss > worst[1]):
                worst = (k, loss)
    return worst


def _row(m: dict, cfg_diff: str, decision: str) -> str:
    s = m["slices"]

    def g(*p):
        cur = s
        for x in p:
            cur = cur.get(x, {}) if isinstance(cur, dict) else {}
        return f"{100 * cur['cer']:.2f}%" if "cer" in cur else "—"

    o = m["overall"]
    return (f"| {m.get('run_id', '')} | {cfg_diff} | {100 * o['cer']:.2f}% | {100 * o['cer_e2e']:.2f}% | "
            f"{g('category', 'mixed')} | {g('mac_typical', 'mixed')} | {g('win_typical', 'mixed')} | {decision} |")


def coordinate_descent(knobs: dict[str, list], base: dict, evaluate: Callable[[dict], dict], split: str = "dev",
                       max_passes: int = 3, budget: int = 60, log: Path | None = None,
                       out: Path | None = None) -> dict:
    log_lines = []
    if log is not None:
        log = Path(log)
        if not log.exists():
            log.write_text("# OpenThai sweep — iterations log\n\n", encoding="utf-8")
        with open(log, "a", encoding="utf-8") as f:
            f.write(f"\n## Sweep started {dt.datetime.now().isoformat(timespec='seconds')} on `{split}`\n\n"
                    f"Base config: `{json.dumps(base, sort_keys=True)}`\n\n"
                    "| run | change | CER | CER_e2e | mixed | mac·mixed | win·mixed | decision |\n"
                    "|---|---|---|---|---|---|---|---|\n")

    def note(line: str):
        log_lines.append(line)
        if log is not None:
            with open(log, "a", encoding="utf-8") as f:
                f.write(line + "\n")

    cache: dict[str, dict] = {}
    calls = 0

    def run(cfg: dict) -> dict | None:
        nonlocal calls
        key = json.dumps(cfg, sort_keys=True)
        if key in cache:
            return cache[key]
        if calls >= budget:
            return None
        calls += 1
        cache[key] = evaluate(cfg)
        return cache[key]

    best_cfg = copy.deepcopy(base)
    best = run(best_cfg)
    note(_row(best, "base", "baseline"))
    history = [{"config": best_cfg, "run_id": best.get("run_id"), "cer_e2e": best["overall"]["cer_e2e"],
                "decision": "baseline"}]
    for p in range(max_passes):
        adopted = False
        for knob, values in knobs.items():
            cur_val = get_knob(best_cfg, knob)
            for v in values:
                if v == cur_val:
                    continue
                cand_cfg = set_knob(best_cfg, knob, v)
                m = run(cand_cfg)
                if m is None:
                    note(f"| — | budget of {budget} evaluations reached | | | | | | stop |")
                    _save(out, base, best_cfg, history, calls)
                    return best_cfg
                gain = best["overall"]["cer_e2e"] - m["overall"]["cer_e2e"]
                reg = _slice_regression(m, best)
                if gain >= MIN_GAIN and reg is None:
                    decision = f"ADOPT (−{100 * gain:.2f} pt)"
                    best_cfg, best, adopted = cand_cfg, m, True
                elif reg is not None and gain >= MIN_GAIN:
                    decision = f"reject: {reg[0]} +{100 * reg[1]:.2f} pt"
                else:
                    decision = f"reject ({-100 * gain:+.2f} pt)"
                note(_row(m, f"pass {p + 1}: {knob}={v}", decision))
                history.append({"config": cand_cfg, "run_id": m.get("run_id"), "cer_e2e": m["overall"]["cer_e2e"],
                                "decision": decision})
        if not adopted:
            note(f"| — | pass {p + 1} adopted nothing | | | | | | stop |")
            break
    _save(out, base, best_cfg, history, calls)
    return best_cfg


def _save(out: Path | None, base: dict, best_cfg: dict, history: list, calls: int):
    if out is None:
        return
    Path(out).write_text(json.dumps({"base": base, "best_config": best_cfg, "evaluations": calls,
                                     "history": history}, indent=1))
