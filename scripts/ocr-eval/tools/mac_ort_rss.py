"""Re-check ort's peak memory on the Mac: full /usr/bin/time -l output, arena on/off."""
import json
from pathlib import Path
from ocr_eval import paths, perf

cfg = json.dumps(json.dumps(json.loads((paths.RUNS / "best_config.json").read_text())))

def work(remote, items):
    exe = perf.mac_build(remote, "ort")
    lst = "".join(f"{i}\t{remote}/img/{Path(p).name}\\n" for i, p in items)
    perf._ssh(f"printf '{lst}' > {remote}/in.tsv && printf %s {cfg} > {remote}/cfg.json")
    out = {}
    for arena in ("0", "1"):
        r = perf._ssh(f"OPENTHAI_ORT_ARENA={arena} /usr/bin/time -l {exe} --model-dir {remote}/models --images {remote}/in.tsv "
                      f"--out {remote}/o.jsonl --config {remote}/cfg.json --backend ort --threads 4 --repeat 1 2>&1 | "
                      f"grep -E 'real|maximum resident|peak memory|instructions retired'")
        out[arena] = r.stdout
        print("arena", arena, r.stdout, flush=True)
    return out

print(perf.mac_session(work))
