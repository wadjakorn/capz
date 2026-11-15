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
        rep = check.check_split(split, determinism_share=a.determinism)
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


def _cmd_sweep(a: argparse.Namespace) -> int:
    import json

    from . import paths, sweep
    from .engines import openthai
    from .engines.base import run_engine
    from .metrics.score import score_run

    def evaluate(cfg: dict) -> dict:
        d = run_engine("openthai", openthai.recognize, a.split, cfg, workers=a.workers)
        m = score_run(d, paths.corpus_dir(a.split))
        m["run_id"] = d.name
        return m

    paths.EVIDENCE.mkdir(parents=True, exist_ok=True)
    best = sweep.coordinate_descent(sweep.KNOBS, openthai.B0, evaluate, split=a.split, budget=a.budget,
                                    log=paths.EVIDENCE / "iterations.md", out=paths.RUNS / "sweep.json")
    print("best_config:", json.dumps(best, sort_keys=True))
    return 0


def _best_config() -> dict:
    import json

    from . import paths
    from .engines import openthai

    sw = paths.RUNS / "sweep.json"
    return json.loads(sw.read_text())["best_config"] if sw.exists() else openthai.B0


def _cmd_perf(a: argparse.Namespace) -> int:
    """P1 inputs: Linux (this box) for ort and tract; --mac adds the Mac over SSH."""
    import json

    from . import perf, pipeline

    cfg = _best_config()
    res = {f"linux-{b}": perf.measure_linux(b, cfg, threads=a.threads, repeat=3) for b in ("ort", "tract")}
    if a.mac:
        res.update(perf.mac_session(lambda remote, items: {
            f"mac-{b}": perf.measure_mac(remote, items, b, cfg, threads=a.threads, repeat=3) for b in ("ort", "tract")}))
    keep = ("p50_ms", "p95_ms", "cold_ms", "rss_mb")
    (pipeline.PERF.parent / "perf_all.json").write_text(json.dumps(res, indent=1))
    pipeline.PERF.write_text(json.dumps({f"{k.split('-')[0]} (ort)": {x: v[x] for x in keep}
                                         for k, v in res.items() if k.endswith("-ort")}, indent=1))
    print(json.dumps(res, indent=1))
    return 0


def _cmd_size(a: argparse.Namespace) -> int:
    """S1 inputs: Linux builds here, --mac builds on the Mac, Windows estimated from the official DLL."""
    import json

    from . import perf, pipeline, size

    lin = size.measure_linux()
    per = {"x86_64-unknown-linux-gnu": lin}
    if a.mac:
        def work(remote, _items):
            exes = {(b or "none"): perf.mac_build(remote, b) for b in (None, "ort", "tract")}
            return size.file_sizes_remote(lambda c: perf._ssh(c, timeout=600), exes)
        mac = perf.mac_session(work)
        mac["models_zip"] = lin["models_zip"]
        per["aarch64-apple-darwin"] = mac
    out = size.summarize(per, backend="ort")
    out["targets"]["x86_64-pc-windows-msvc"] = size.windows_estimate(lin["none_zip"], lin["models_zip"])
    pipeline.SIZE.write_text(json.dumps(out, indent=1))
    for t, v in out["targets"].items():
        print(t, v["added_zip_mb"], v["by_backend"])
    return 0


def _cmd_all(a: argparse.Namespace) -> int:
    """Every engine on one split with frozen configs, scored; on `test` also sets roles and gates."""
    import json

    from . import paths, pipeline
    from .engines import ENGINES
    from .engines.base import run_engine
    from .metrics.score import score_run

    best = _best_config()
    ablated = json.loads(json.dumps(best))
    ablated.setdefault("det", {})["split_gap"] = 0
    ablated["ori"] = {"enabled": False}
    plan = [("ot_test", "openthai", best), ("py_for_rust_test", "openthai", ablated), ("tess_test", "tesseract", {}),
            ("vision_test", "vision", {}), ("rust_test", "rust-ort", best)]
    roles = {}
    for role, eng, cfg in plan:
        mod = ENGINES[eng]
        if hasattr(mod, "available") and not mod.available():
            print(f"skip {eng}: not available")
            continue
        d = run_engine(eng, mod.recognize, a.split, cfg)
        m = score_run(d, paths.corpus_dir(a.split))
        print(f"{role:18s} {d.name}: CER {100 * m['overall']['cer']:.2f}%")
        roles[role] = d.name
    if a.split == "test":
        pipeline.set_roles(roles)
        res = pipeline.evaluate()
        print(pipeline.gates_md(res))
        if a.final:
            print("evidence:", pipeline.write_final(res))
    return 0


def build_parser() -> argparse.ArgumentParser:
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
    c.add_argument("--determinism", type=float, default=0.25, help="share of images re-rendered for H2 (1.0 = all)")
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
    sw = sub.add_parser("sweep", help="coordinate descent over OpenThai knobs (dev only)")
    sw.add_argument("--split", default="dev", choices=["dev", "smoke"])
    sw.add_argument("--workers", type=int, default=10)
    sw.add_argument("--budget", type=int, default=60)
    sw.set_defaults(fn=_cmd_sweep)
    pf = sub.add_parser("perf", help="P1: speed and peak RSS of the Rust prototype (perf split)")
    pf.add_argument("--threads", type=int, default=4)
    pf.add_argument("--mac", action="store_true")
    pf.set_defaults(fn=_cmd_perf)
    sz = sub.add_parser("size", help="S1: what shipping OpenThai adds, per target")
    sz.add_argument("--mac", action="store_true")
    sz.set_defaults(fn=_cmd_size)
    al = sub.add_parser("all", help="every engine on a split with frozen configs; gates on test")
    al.add_argument("--split", default="test")
    al.add_argument("--final", action="store_true")
    al.set_defaults(fn=_cmd_all)
    return p


def main(argv: list[str] | None = None) -> int:
    a = build_parser().parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
