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


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ocr-eval")
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download pinned models, tessdata, fonts, chromium")
    f.add_argument("--skip-browser", action="store_true")
    f.add_argument("--skip-fonts", action="store_true")
    f.set_defaults(fn=_cmd_fetch)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
