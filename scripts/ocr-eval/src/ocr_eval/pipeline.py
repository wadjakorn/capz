"""Glue for the end of the loop: which run plays which role, all gates at once,
used by the `gate` and `all` commands in cli.py."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import gates, paths
from .report import summary_md

ROLES = paths.RUNS / "roles.json"
PERF = paths.RUNS / "perf.json"
SIZE = paths.RUNS / "size.json"
SWEEP = paths.RUNS / "sweep.json"
CHECK_SPLITS = ("dev", "test", "perf")


def load_roles() -> dict[str, str]:
    return json.loads(ROLES.read_text()) if ROLES.exists() else {}


def set_roles(pairs: dict[str, str]) -> dict[str, str]:
    roles = load_roles()
    roles.update(pairs)
    ROLES.parent.mkdir(parents=True, exist_ok=True)
    ROLES.write_text(json.dumps(roles, indent=1))
    return roles


def _metrics(run_id: str | None) -> dict | None:
    if not run_id:
        return None
    p = paths.RUNS / run_id / "metrics.json"
    return json.loads(p.read_text()) if p.exists() else None


def _preds(run_id: str | None) -> dict | None:
    if not run_id:
        return None
    p = paths.RUNS / run_id / "predictions.jsonl"
    if not p.exists():
        return None
    return {d["id"]: d for d in (json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip())}


def _checks() -> dict[str, dict]:
    out = {}
    for s in CHECK_SPLITS:
        p = paths.corpus_dir(s) / "check.json"
        if p.exists():
            out[s] = json.loads(p.read_text())
    return out


def evaluate(only: list[str] | None = None) -> dict:
    r = load_roles()
    ot, tess, vis = _metrics(r.get("ot_test")), _metrics(r.get("tess_test")), _metrics(r.get("vision_test"))
    allg = {
        "H1": lambda: gates.h1(tess, vis),
        "H2": lambda: gates.h2(_checks()),
        "A1": lambda: gates.a1(_metrics(r.get("a1_full")), _metrics(r.get("a1_ablated"))),
        "Q1a": lambda: gates.q1a(ot) if ot else gates._skip("no ot_test run"),
        "Q1b": lambda: gates.q1b(ot) if ot else gates._skip("no ot_test run"),
        "Q1c": lambda: gates.q1c(ot) if ot else gates._skip("no ot_test run"),
        "W1": lambda: gates.w1(ot, tess) if ot else gates._skip("no ot_test run"),
        "W2": lambda: gates.w2(ot, tess) if ot else gates._skip("no ot_test run"),
        "M1": lambda: gates.m1(ot, vis) if ot else gates._skip("no ot_test run"),
        "R1": lambda: gates.r1(_metrics(r.get("rust_test")), _metrics(r.get("py_for_rust_test")),
                               _preds(r.get("rust_test")), _preds(r.get("py_for_rust_test"))),
        "P1": lambda: gates.p1(PERF if PERF.exists() else None),
        "S1": lambda: gates.s1(SIZE if SIZE.exists() else None),
    }
    out = {k: f() for k, f in allg.items() if not only or k in only}
    warn = gates.overfit_warning(_metrics(r.get("ot_dev")), ot)
    return {"gates": out, "warnings": [warn] if warn else [], "roles": r}


def gates_md(result: dict) -> str:
    lines = ["| gate | status | why |", "|---|---|---|"]
    for k, g in result["gates"].items():
        lines.append(f"| {k} | {g['status']}{' (info)' if g.get('informational') else ''} | {g['why']} |")
    for w in result["warnings"]:
        lines.append(f"| warning | — | {w} |")
    return "\n".join(lines)


def _scrub_hosts(ev: Path) -> None:
    """Evidence is committed to a public repo: no machine names in it."""
    import socket

    from .engines.base import host_label

    names = {socket.gethostname(): host_label(), "macbook-pro": "darwin-arm64"}
    for f in ev.glob("*.*"):
        if f.suffix not in (".json", ".md"):
            continue
        text = f.read_text(encoding="utf-8")
        new = text
        for name, label in names.items():
            new = new.replace(name, label)
        if new != text:
            f.write_text(new, encoding="utf-8")


def write_final(result: dict) -> Path:
    ev = paths.EVIDENCE
    ev.mkdir(parents=True, exist_ok=True)
    (ev / "gates.json").write_text(json.dumps(result, ensure_ascii=False, indent=1))
    summary = {}
    for role, run_id in result["roles"].items():
        src = paths.RUNS / run_id / "metrics.json"
        if src.exists():
            shutil.copyfile(src, ev / f"metrics-{role}.json")
            summary[f"{role} ({run_id.split('-', 2)[-1]})"] = json.loads(src.read_text())
    for name in ("perf.json", "perf_all.json", "size.json", "sweep.json"):
        if (paths.RUNS / name).exists():
            shutil.copyfile(paths.RUNS / name, ev / name)
    (ev / "summary.md").write_text(summary_md(summary) + "\n\n" + gates_md(result) + "\n", encoding="utf-8")
    _scrub_hosts(ev)
    return ev
