"""Text the corpus is written in.

Four kinds, all from material already in the repo:
  ui_th   — capz's own Thai UI strings (src/i18n/locales/th)
  ui_en   — capz's English UI strings (src/i18n/locales/en)
  mixed   — data/phrases_mixed.txt, hand-picked Thai/English lines
  prose_th — Thai sentences from the repo's Thai docs

Every phrase belongs to dev or test by sha1 parity, so the test split reads
sentences the tuning never saw. Phrases shorter than 4 characters ("ตกลง" is 4)
are too generic to split and go to both."""
from __future__ import annotations

import functools
import hashlib
import re

from . import paths

LOCALES = paths.REPO_ROOT / "src" / "i18n" / "locales"
PROSE_SOURCES = ["docs/OCR-THAI-WINDOWS.th.md", "README.md", "PRODUCT.md", "DESIGN.md"]
PLACEHOLDER = re.compile(r"\{(\w+)\}")
FILL = ["3", "Ctrl+Shift+3", "capz", "12", "PNG", "ลูกศร", "2026-11-15", "1.5x"]
LINE_VALUE = re.compile(r'^\s*"[^"]+"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$')
THAI = re.compile("[฀-๿]")
SHORT = 4


def _unescape(s: str) -> str:
    return s.encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8")


def _fill(s: str) -> str:
    return PLACEHOLDER.sub(lambda m: FILL[int(hashlib.sha1(m.group(1).encode()).hexdigest(), 16) % len(FILL)], s)


def _locale(lang: str) -> list[str]:
    out = []
    for f in sorted((LOCALES / lang).glob("*.ts")):
        for line in f.read_text(encoding="utf-8").splitlines():
            m = LINE_VALUE.match(line)
            if not m:
                continue
            try:
                val = _unescape(m.group(1))
            except UnicodeError:
                continue
            for part in val.split("\n"):
                part = _fill(part).strip()
                if part and "<" not in part and "http" not in part[:4]:
                    out.append(part)
    return out


def _mixed() -> list[str]:
    lines = (paths.DATA / "phrases_mixed.txt").read_text(encoding="utf-8").splitlines()
    return [ln.strip() for ln in lines if ln.strip() and not ln.startswith("#")]


MD_NOISE = [(re.compile(r"`[^`]*`"), ""), (re.compile(r"!\[[^\]]*\]\([^)]*\)"), ""),
            (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"), (re.compile(r"[*_>#|]+"), " "),
            (re.compile(r"\s+"), " ")]


def _prose() -> list[str]:
    out = []
    for rel in PROSE_SOURCES:
        p = paths.REPO_ROOT / rel
        if not p.exists():
            continue
        in_code = False
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("```"):
                in_code = not in_code
                continue
            if in_code or not THAI.search(line):
                continue
            for rx, rep in MD_NOISE:
                line = rx.sub(rep, line)
            line = line.strip(" -:")
            if len(line) >= 12:
                out.append(line)
    return out


def _side(p: str) -> str:
    return "dev" if int(hashlib.sha1(p.encode("utf-8")).hexdigest(), 16) % 2 == 0 else "test"


@functools.cache
def _all() -> dict[str, list[str]]:
    kinds = {"ui_th": _locale("th"), "ui_en": _locale("en"), "mixed": _mixed(), "prose_th": _prose()}
    return {k: sorted(set(v)) for k, v in kinds.items()}


@functools.cache
def pool(split: str) -> dict[str, list[str]]:
    side = "test" if split == "test" else "dev"
    return {k: [p for p in v if len(p) < SHORT or _side(p) == side] for k, v in _all().items()}
