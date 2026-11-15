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
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
