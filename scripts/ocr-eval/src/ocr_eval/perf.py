"""Gate P1: speed and memory of the Rust prototype on 2560×1600 dense screenshots,
on this Linux box and on the Mac. Peak RSS comes from /usr/bin/time."""
from __future__ import annotations

import json
import re
import socket
import subprocess
import tempfile
import uuid
from pathlib import Path

from . import paths
from .engines import rustproto
from .engines.base import split_items

MAC = "macbook-pro"


def parse_rss_mb(time_output: str) -> float:
    m = re.search(r"Maximum resident set size \(kbytes\):\s*(\d+)", time_output)
    if m:
        return int(m.group(1)) / 1024
    m = re.search(r"(\d+)\s+maximum resident set size", time_output)
    if m:
        return int(m.group(1)) / (1024 * 1024)
    raise ValueError("no RSS in /usr/bin/time output")


def _summary(perf: dict, rss_mb: float, host: str, backend: str, threads: int) -> dict:
    return {"host": host, "backend": backend, "threads": threads, "p50_ms": perf["p50_ms"],
            "p95_ms": perf["p95_ms"], "cold_ms": perf["cold_ms"], "load_ms": perf["load_ms"],
            "rss_mb": round(rss_mb, 1), "warm_n": perf["warm_n"]}


def measure_linux(backend: str, config: dict, threads: int = 4, repeat: int = 3) -> dict:
    exe = rustproto.build(backend)
    items = split_items("perf")
    with tempfile.TemporaryDirectory() as td:
        lst, out, pf, cfg = (Path(td) / n for n in ("in.tsv", "out.jsonl", "perf.json", "cfg.json"))
        lst.write_text("".join(f"{i}\t{p}\n" for i, p in items))
        cfg.write_text(json.dumps(config))
        r = subprocess.run(["/usr/bin/time", "-v", str(exe), "--model-dir", str(paths.model_dir()), "--images",
                            str(lst), "--out", str(out), "--config", str(cfg), "--backend", backend,
                            "--threads", str(threads), "--repeat", str(repeat), "--perf-out", str(pf)],
                           capture_output=True, text=True, check=True)
        return _summary(json.loads(pf.read_text()), parse_rss_mb(r.stderr), socket.gethostname(), backend, threads)


def _ssh(cmd: str, timeout: int = 3600) -> subprocess.CompletedProcess:
    return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", MAC, cmd],
                          capture_output=True, text=True, timeout=timeout)


def mac_session(fn):
    """Run fn(remote_dir) with the crate, models and perf images copied to a fresh
    /tmp directory on the Mac; the directory is removed afterwards."""
    remote = f"/tmp/ocr-proto-{uuid.uuid4().hex[:10]}"
    try:
        _ssh(f"mkdir -p {remote}/img {remote}/models", timeout=60)
        crate = rustproto.CRATE
        subprocess.run(["rsync", "-a", "--exclude", "target", f"{crate}/", f"{MAC}:{remote}/crate/"], check=True)
        md = paths.model_dir()
        subprocess.run(["rsync", "-a", f"{md}/det.onnx", f"{md}/rec.onnx", f"{md}/rec_dict.txt",
                        f"{MAC}:{remote}/models/"], check=True)
        items = split_items("perf")
        subprocess.run(["rsync", "-a", *[str(p) for _, p in items], f"{MAC}:{remote}/img/"], check=True)
        return fn(remote, items)
    finally:
        _ssh(f"rm -rf {remote}", timeout=300)  # remote is always /tmp/ocr-proto-<random> on the Mac


def mac_build(remote: str, backend: str | None) -> str:
    feat = f"--features backend-{backend}" if backend else ""
    tdir = f"{remote}/target/{backend or 'none'}"
    # ort's prebuilt ONNX Runtime for macOS is built for 13.4; linking it at the default
    # 11.0 target fails (___isPlatformVersionAtLeast). capz itself promises macOS 12+.
    # Its CoreML EP also calls ___isPlatformVersionAtLeast from compiler-rt, which rustc's
    # macOS link line does not include: link libclang_rt.osx.a explicitly.
    env = ('MACOSX_DEPLOYMENT_TARGET=13.4 RUSTFLAGS="-C link-arg=$(xcrun clang --print-runtime-dir)'
           '/libclang_rt.osx.a" ' if backend == "ort" else "")
    r = _ssh(f"cd {remote}/crate && {env}~/.cargo/bin/cargo build --release --quiet {feat} --target-dir {tdir} 2>&1",
             timeout=3600)
    if r.returncode:
        raise RuntimeError(f"mac build ({backend}) failed: {r.stdout[-2000:]}")
    return f"{tdir}/release/openthai-proto"


def measure_mac(remote: str, items, backend: str, config: dict, threads: int = 4, repeat: int = 3) -> dict:
    exe = mac_build(remote, backend)
    lst = "".join(f"{i}\t{remote}/img/{Path(p).name}\\n" for i, p in items)
    cfg = json.dumps(json.dumps(config))
    r = _ssh(f"printf '{lst}' > {remote}/in.tsv && printf %s {cfg} > {remote}/cfg.json && "
             f"/usr/bin/time -l {exe} --model-dir {remote}/models --images {remote}/in.tsv --out {remote}/out.jsonl "
             f"--config {remote}/cfg.json --backend {backend} --threads {threads} --repeat {repeat} "
             f"--perf-out {remote}/perf.json 2> {remote}/time.txt; cat {remote}/perf.json; echo @@@; cat {remote}/time.txt")
    if "@@@" not in r.stdout:
        raise RuntimeError(f"mac perf run failed: {r.stdout[-1500:]} {r.stderr[-500:]}")
    perf_json, time_txt = r.stdout.split("@@@", 1)
    return _summary(json.loads(perf_json), parse_rss_mb(time_txt), MAC, backend, threads)
