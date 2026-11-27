"""Fonts the corpus renders with.

System fonts are used from their install path. Google Fonts are pinned to one
google/fonts commit, recorded with their sha256 in fonts.lock.json on first
fetch (trust on first use) and verified on every later fetch."""
from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .. import paths
from ..fetch import fetch_pinned, sha256_file

LOCK = paths.PKG_ROOT / "fonts.lock.json"


@dataclass(frozen=True)
class Font:
    key: str
    family: str  # CSS family name we register
    regular: str  # "system:/abs/path" or "gf:ofl/<dir>/<file>"
    bold: str | None  # same; None = variable font covers bold (or synthesize)
    looped: bool  # looped Thai (Tahoma/Loma style) vs loopless (Leelawadee/Sukhumvit style)


FONTS: dict[str, Font] = {f.key: f for f in [
    Font("noto-sans-thai", "Noto Sans Thai", "system:/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
         "system:/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf", False),
    Font("loma", "Loma", "system:/usr/share/fonts/opentype/tlwg/Loma.otf",
         "system:/usr/share/fonts/opentype/tlwg/Loma-Bold.otf", True),
    Font("sarabun", "Sarabun", "gf:ofl/sarabun/Sarabun-Regular.ttf", "gf:ofl/sarabun/Sarabun-Bold.ttf", True),
    Font("ibm-plex-sans-thai", "IBM Plex Sans Thai", "gf:ofl/ibmplexsansthai/IBMPlexSansThai-Regular.ttf",
         "gf:ofl/ibmplexsansthai/IBMPlexSansThai-Bold.ttf", False),
    Font("prompt", "Prompt", "gf:ofl/prompt/Prompt-Regular.ttf", "gf:ofl/prompt/Prompt-Bold.ttf", False),
    Font("anuphan", "Anuphan", "gf:ofl/anuphan/Anuphan[wght].ttf", None, False),
    Font("noto-sans-thai-looped", "Noto Sans Thai Looped", "gf:ofl/notosansthailooped/NotoSansThaiLooped[wdth,wght].ttf",
         None, True),
    Font("noto-sans-mono", "Noto Sans Mono", "gf:ofl/notosansmono/NotoSansMono[wdth,wght].ttf", None, False),
]}

DEV_FONTS = ["noto-sans-thai", "loma", "sarabun", "ibm-plex-sans-thai", "prompt"]
TEST_ONLY_FONTS = ["anuphan", "noto-sans-thai-looped"]
MONO = "noto-sans-mono"


def _gf_refs() -> list[str]:
    out = []
    for f in FONTS.values():
        for ref in (f.regular, f.bold):
            if ref and ref.startswith("gf:"):
                out.append(ref[3:])
    return out


def _latest_commit() -> str:
    req = urllib.request.Request("https://api.github.com/repos/google/fonts/commits/main",
                                 headers={"User-Agent": "ocr-eval/0.1", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["sha"]


def _gf_url(commit: str, rel: str) -> str:
    return f"https://raw.githubusercontent.com/google/fonts/{commit}/{urllib.request.quote(rel)}"


def fetch_fonts() -> Path:
    """Download (or verify) every Google Font. Writes fonts.lock.json on first use."""
    d = paths.fonts_dir()
    if LOCK.exists():
        lock = json.loads(LOCK.read_text())
        for rel, digest in lock["files"].items():
            fetch_pinned(_gf_url(lock["commit"], rel), d / rel, digest)
        return d
    commit = _latest_commit()
    files = {}
    for rel in _gf_refs():
        dest = d / rel
        # TOFU: download once, hash it, then re-fetch through fetch_pinned so the
        # same verified path is exercised.
        dest.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(_gf_url(commit, rel), headers={"User-Agent": "ocr-eval/0.1"})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())
        tmp_digest = sha256_file(dest)
        files[rel] = tmp_digest
    LOCK.write_text(json.dumps({"commit": commit, "files": files}, indent=2) + "\n")
    return d


def font_path(ref: str) -> Path:
    if ref.startswith("system:"):
        return Path(ref[len("system:"):])
    return paths.fonts_dir() / ref[3:]


def font_face_css(key: str, url_for) -> str:
    """@font-face rules for one font; `url_for(path)` maps a file to a URL the page can load."""
    f = FONTS[key]
    rules = []
    if f.bold:
        for ref, weight in ((f.regular, 400), (f.bold, 700)):
            rules.append(f'@font-face{{font-family:"{f.family}";src:url("{url_for(font_path(ref))}");'
                         f"font-weight:{weight};font-style:normal}}")
    else:
        rules.append(f'@font-face{{font-family:"{f.family}";src:url("{url_for(font_path(f.regular))}");'
                     "font-weight:100 900;font-style:normal}")
    return "\n".join(rules)
