"""Side-by-side table of two runs (markdown)."""
from __future__ import annotations

from .bootstrap import paired_bootstrap

ROWS = [("overall", None, None), ("mixed", "category", "mixed"), ("thai", "category", "thai"),
        ("english", "category", "english"), ("mac_typical·mixed", "mac_typical", "mixed"),
        ("win_typical·mixed", "win_typical", "mixed"), ("easy·english", "easy", "english")]


def _get(m: dict, sl: str | None, v: str | None) -> dict | None:
    if sl is None:
        return m["overall"]
    return m["slices"].get(sl, {}).get(v)


def pct(x: float | None) -> str:
    return "—" if x is None else f"{100 * x:.2f}%"


def compare_md(a: dict, b: dict, name_a: str = "A", name_b: str = "B") -> str:
    d, lo, hi = paired_bootstrap(a, b)
    out = [f"| slice | {name_a} CER | {name_b} CER | Δ (A−B) |", "|---|---|---|---|"]
    for label, sl, v in ROWS:
        x, y = _get(a, sl, v), _get(b, sl, v)
        if not x and not y:
            continue
        cx, cy = (x or {}).get("cer"), (y or {}).get("cer")
        delta = f"{100 * (cx - cy):+.2f} pt" if cx is not None and cy is not None else "—"
        out.append(f"| {label} | {pct(cx)} | {pct(cy)} | {delta} |")
    out.append(f"| fp_per_1k | {a['overall']['fp_per_1k']:.1f} | {b['overall']['fp_per_1k']:.1f} | "
               f"{a['overall']['fp_per_1k'] - b['overall']['fp_per_1k']:+.1f} |")
    out.append("")
    out.append(f"Paired bootstrap ΔCER (overall) = {100 * d:+.2f} pt, 95% CI [{100 * lo:+.2f}, {100 * hi:+.2f}]")
    return "\n".join(out)
