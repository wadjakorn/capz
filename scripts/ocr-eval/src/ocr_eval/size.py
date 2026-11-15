"""Gate S1: what shipping OpenThai adds to capz, per target.

added = zip -9(binary with backend) − zip -9(binary without any backend) + zip -9(models).
The binaries are the Rust prototype built in release mode with strip + thin LTO,
so the delta is the inference runtime plus the ported pipeline."""
from __future__ import annotations

import io
import subprocess
import zipfile
from pathlib import Path

from . import paths
from .engines import rustproto

MODEL_FILES = ("det.onnx", "rec.onnx", "rec_dict.txt")


def zip9(files: dict[str, bytes]) -> int:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return len(buf.getvalue())


def added_mb(sizes: dict[str, int], backend: str) -> float:
    return round((sizes[f"{backend}_zip"] - sizes["none_zip"] + sizes["models_zip"]) / 1e6, 2)


def models_zip() -> int:
    md = paths.model_dir()
    return zip9({n: (md / n).read_bytes() for n in MODEL_FILES})


def measure_linux() -> dict:
    sizes: dict[str, int] = {"models_zip": models_zip()}
    for backend in (None, "ort", "tract"):
        key = backend or "none"
        tdir = rustproto.CRATE / "target" / key
        cmd = ["cargo", "build", "--release", "--quiet", "--target-dir", str(tdir)]
        if backend:
            cmd += ["--features", f"backend-{backend}"]
        subprocess.run(cmd, cwd=rustproto.CRATE, check=True)
        exe = tdir / "release" / "openthai-proto"
        sizes[f"{key}_raw"] = exe.stat().st_size
        sizes[f"{key}_zip"] = zip9({"openthai-proto": exe.read_bytes()})
    return sizes


def summarize(per_target: dict[str, dict], backend: str = "ort") -> dict:
    """S1 scores the backend that P1 measured and the report recommends (not the smallest one);
    every backend's figure is kept under by_backend."""
    out = {}
    for target, sizes in per_target.items():
        by = {b: added_mb(sizes, b) for b in ("ort", "tract") if f"{b}_zip" in sizes}
        out[target] = {"added_zip_mb": by[backend], "backend": backend, "by_backend": by, "sizes": sizes}
    return {"targets": out}


# No Windows build host: the estimate uses Microsoft's own onnxruntime.dll 1.24.4 (the ONNX Runtime
# release ort 2.0.0-rc.15 targets), loaded dynamically, plus this crate's code and the models.
WIN_DLL = {"url": "https://github.com/microsoft/onnxruntime/releases/download/v1.24.4/onnxruntime-win-x64-1.24.4.zip",
           "raw_mb": 14.20, "zip9_mb": 5.25, "signer": "Microsoft Corporation (Authenticode)"}


def windows_estimate(none_zip: int, models_zip: int) -> dict:
    mb = round(WIN_DLL["zip9_mb"] + none_zip / 1e6 + models_zip / 1e6, 2)
    return {"added_zip_mb": mb, "backend": "ort", "estimate": True, "by_backend": {"ort (load-dynamic, official DLL)": mb},
            "basis": f"onnxruntime.dll 1.24.4 {WIN_DLL['raw_mb']} MB raw / {WIN_DLL['zip9_mb']} MB zip -9, "
                     f"signed by {WIN_DLL['signer']}; + crate code (Linux 'none' build) + models"}


def file_sizes_remote(ssh, remote_exes: dict[str, str]) -> dict[str, int]:
    """Sizes and zip -9 sizes of binaries on the Mac (zip runs there)."""
    out = {}
    for key, exe in remote_exes.items():
        r = ssh(f"stat -f %z {exe} && cd $(dirname {exe}) && rm -f /tmp/{key}.zip && zip -q -9 /tmp/{key}.zip "
                f"$(basename {exe}) && stat -f %z /tmp/{key}.zip && rm -f /tmp/{key}.zip")
        raw, zipped = (int(x) for x in r.stdout.split()[:2])
        out[f"{key}_raw"], out[f"{key}_zip"] = raw, zipped
    return out


def write(path: Path, data: dict):
    import json

    path.write_text(json.dumps(data, indent=1))
