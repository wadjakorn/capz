"""`ocr-eval` command line. Each subcommand exits non-zero when its check fails,
so the loop can be driven by exit codes alone."""
from __future__ import annotations

import argparse
import subprocess
import sys


def _cmd_fetch(a: argparse.Namespace) -> int:
    from . import fetch

    print("models:", fetch.fetch_models())
    print("tessdata:", fetch.fetch_tessdata())
    if not a.skip_browser:
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
    if not a.skip_fonts:
        from .corpus import fonts

        print("fonts:", fonts.fetch_fonts())
    return 0


def _cmd_corpus(a: argparse.Namespace) -> int:
    from .corpus import check, render

    for split in a.split:
        if not a.check_only:
            print("rendered:", render.render_split(split, workers=a.workers))
        rep = check.check_split(split)
        import dataclasses
        import json

        from . import paths

        (paths.corpus_dir(split) / "check.json").write_text(json.dumps(dataclasses.asdict(rep), indent=1))
        print(f"{split}: n={rep.n} coverage_min={rep.coverage_min:.4f} "
              f"determinism_checked={rep.determinism_checked} ok={rep.ok}")
        for b in rep.bad[:20]:
            print("  BAD", b)
        if not rep.ok:
            return 1
    return 0


def _run_dir(r: str):
    from pathlib import Path

    from . import paths

    p = Path(r)
    return p if p.exists() else paths.RUNS / r


def _cmd_score(a: argparse.Namespace) -> int:
    import json

    from . import paths
    from .metrics.score import score_run

    for r in a.run:
        d = _run_dir(r)
        split = json.loads((d / "run.json").read_text())["split"]
        m = score_run(d, paths.corpus_dir(split))
        o = m["overall"]
        print(f"{d.name}: CER {100 * o['cer']:.2f}%  CER_e2e {100 * o['cer_e2e']:.2f}%  "
              f"fp/1k {o['fp_per_1k']:.1f}  chars {o['n_chars']}  failed {len(m['failed_images'])}")
    return 0


def _cmd_compare(a: argparse.Namespace) -> int:
    import json

    from .metrics.compare import compare_md

    ma, mb = (json.loads((_run_dir(r) / "metrics.json").read_text()) for r in (a.a, a.b))
    print(compare_md(ma, mb, _run_dir(a.a).name, _run_dir(a.b).name))
    return 0


def _parse_config(v: str | None) -> dict:
    import json
    from pathlib import Path

    if not v:
        return {}
    return json.loads(Path(v[1:]).read_text()) if v.startswith("@") else json.loads(v)


def _cmd_run(a: argparse.Namespace) -> int:
    from . import paths
    from .engines import ENGINES
    from .engines.base import run_engine
    from .metrics.score import score_run

    mod = ENGINES[a.engine]
    if hasattr(mod, "available") and not mod.available():
        print(f"{a.engine}: not available on this host")
        return 2
    cfg = _parse_config(a.config)
    if not cfg and hasattr(mod, "B0"):
        cfg = mod.B0
    kw = {"workers": a.workers} if a.workers else {}
    for split in a.split:
        d = run_engine(a.engine, mod.recognize, split, cfg, **kw)
        m = score_run(d, paths.corpus_dir(split))
        o = m["overall"]
        print(f"{d.name}: CER {100 * o['cer']:.2f}%  CER_e2e {100 * o['cer_e2e']:.2f}%  fp/1k {o['fp_per_1k']:.1f}  "
              f"mixed {100 * m['slices']['category'].get('mixed', {}).get('cer', 0):.2f}%  "
              f"p50 {m['latency'].get('p50_ms', 0):.0f} ms  failed {len(m['failed_images'])}")
    return 0


def _cmd_gate(a: argparse.Namespace) -> int:
    import json

    from . import pipeline

    if a.set:
        pipeline.set_roles(dict(kv.split("=", 1) for kv in a.set))
    res = pipeline.evaluate(a.only.split(",") if a.only else None)
    (pipeline.paths.RUNS / "gates.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(pipeline.gates_md(res))
    if a.final:
        print("evidence:", pipeline.write_final(res))
    return 0


def _cmd_report(a: argparse.Namespace) -> int:
    import json

    from . import paths, report

    for r in a.run:
        d = _run_dir(r)
        split = json.loads((d / "run.json").read_text())["split"]
        print(report.errors_md(d, paths.corpus_dir(split), top=a.top))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ocr-eval")
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download pinned models, tessdata, fonts, chromium")
    f.add_argument("--skip-browser", action="store_true")
    f.add_argument("--skip-fonts", action="store_true")
    f.set_defaults(fn=_cmd_fetch)
    c = sub.add_parser("corpus", help="render a split and run the H2 self-check")
    c.add_argument("--split", action="append", required=True)
    c.add_argument("--workers", type=int, default=4)
    c.add_argument("--check-only", action="store_true")
    c.set_defaults(fn=_cmd_corpus)
    sc = sub.add_parser("score", help="score run(s) against their split's ground truth")
    sc.add_argument("run", nargs="+")
    sc.set_defaults(fn=_cmd_score)
    cp = sub.add_parser("compare", help="markdown table of two scored runs with paired bootstrap")
    cp.add_argument("a")
    cp.add_argument("b")
    cp.set_defaults(fn=_cmd_compare)
    r = sub.add_parser("run", help="run an engine on split(s), then score")
    r.add_argument("--engine", required=True)
    r.add_argument("--split", action="append", required=True)
    r.add_argument("--config", help="JSON, or @path/to/config.json")
    r.add_argument("--workers", type=int, default=6)
    r.set_defaults(fn=_cmd_run)
    g = sub.add_parser("gate", help="evaluate the pre-registered gates (roles in runs/roles.json)")
    g.add_argument("--set", action="append", help="role=run_id (ot_test, ot_dev, tess_test, vision_test, "
                   "a1_full, a1_ablated, rust_test, py_for_rust_test)")
    g.add_argument("--only", help="comma-separated gate ids")
    g.add_argument("--final", action="store_true", help="also write docs/research/evidence/openthai2-ocr/")
    g.set_defaults(fn=_cmd_gate)
    rp = sub.add_parser("report", help="worst-error gallery (errors.md + crops) for run(s)")
    rp.add_argument("run", nargs="+")
    rp.add_argument("--top", type=int, default=30)
    rp.set_defaults(fn=_cmd_report)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
