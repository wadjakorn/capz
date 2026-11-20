"""Download pinned artefacts. A file is only ever moved into place after its
sha256 matches the pin, so a half-written or tampered download never lands."""
from __future__ import annotations

import hashlib
import os
import time
import urllib.request
from pathlib import Path

from . import paths, pins


class HashMismatch(RuntimeError):
    pass


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_pinned(url: str, dest: Path, sha256: str, retries: int = 3) -> Path:
    dest = Path(dest)
    if dest.exists() and sha256_file(dest) == sha256:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(dest) + ".tmp")
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ocr-eval/0.1"})
            with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            got = sha256_file(tmp)
            if got != sha256:
                tmp.unlink(missing_ok=True)
                raise HashMismatch(f"{url}: sha256 {got} != pinned {sha256}")
            os.replace(tmp, dest)
            return dest
        except HashMismatch:
            raise
        except Exception as e:  # network errors: retry
            last = e
            tmp.unlink(missing_ok=True)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"download failed after {retries} tries: {url}: {last}")


def fetch_models() -> Path:
    d = paths.model_dir()
    for rel, digest in pins.OPENTHAI_FILES.items():
        fetch_pinned(pins.openthai_url(rel), d / rel, digest)
    return d


def fetch_tessdata() -> Path:
    d = paths.tessdata_dir()
    for name, digest in pins.TESSDATA_FILES.items():
        fetch_pinned(pins.tessdata_url(name), d / name, digest)
    return d
