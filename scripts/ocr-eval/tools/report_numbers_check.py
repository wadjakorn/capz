"""Every decimal number in the report must be traceable to evidence (or be flagged)."""
import json, re, sys
from pathlib import Path
report = Path(sys.argv[1]).read_text(encoding="utf-8")
ev = Path(sys.argv[2])
vals = set()
def walk(x):
    if isinstance(x, dict):
        for v in x.values(): walk(v)
    elif isinstance(x, list):
        for v in x: walk(v)
    elif isinstance(x, (int, float)) and not isinstance(x, bool):
        for f in (x, x * 100, x / 1000, x / 1e6, x / 2**20):
            for d in (0, 1, 2, 3, 4):
                vals.add(f"{round(f, d):.{d}f}")
for f in ev.glob("*.json"):
    walk(json.loads(f.read_text()))
text_ev = (ev / "iterations.md").read_text()
nums = re.findall(r"(?<![\w.])(\d+\.\d+)(?![\w])", report)
missing = sorted({n for n in nums if n not in vals and n not in text_ev})
print(len(nums), "decimal numbers;", len(missing), "not found in evidence:")
print(" ".join(missing))
