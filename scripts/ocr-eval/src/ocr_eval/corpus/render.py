"""Render specs to PNG + ground truth with headless Chromium.

Each sample is rendered twice: normally, and with every GT text made
transparent. The pixel difference is the text's ink, which check.py compares
against the GT boxes (gate H2) — so a wrong box can't hide."""
from __future__ import annotations

import hashlib
import io
import json
import math
import urllib.parse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .. import paths
from . import fonts as fonts_mod
from . import templates
from .spec import VIEWPORT, SampleSpec, build_specs

HOST = "http://corpus.local"
JS = (Path(__file__).with_name("gt_extract.js")).read_text(encoding="utf-8")
TRANSPARENT_CSS = ("body *:not([data-gt-ignore]):not([data-gt-ignore] *){color:transparent!important;"
                   "-webkit-text-fill-color:transparent!important;text-shadow:none!important}")
INK_THRESHOLD = 32
SNAP = 4  # CSS px; every DPR we use maps multiples of 4 to whole device pixels


def url_for(path: Path) -> str:
    return f"{HOST}/font/{urllib.parse.quote(str(path))}"


def wrap_html(body: str, font_key: str = "noto-sans-thai", css_px: int = 16, theme: str = "light") -> str:
    """A minimal page around arbitrary body HTML (tests and fixtures)."""
    sp = SampleSpec("adhoc", "dev", "adhoc", font_key, css_px, 1.0, theme, "viewport", 0)
    import random

    return templates.page(sp, body, "", random.Random(0), url_for)


@dataclass
class Sample:
    png: bytes
    ink: np.ndarray  # bool, image pixels
    gt: dict
    html: str


def _gray(png: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(png)).convert("L"), dtype=np.int16)


def _snap_region(r: dict) -> dict:
    x0 = max(0, math.floor(r["x"] / SNAP) * SNAP)
    y0 = max(0, math.floor(r["y"] / SNAP) * SNAP)
    x1 = min(VIEWPORT[0], math.ceil((r["x"] + r["width"]) / SNAP) * SNAP)
    y1 = min(VIEWPORT[1], math.ceil((r["y"] + r["height"]) / SNAP) * SNAP)
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def _to_px(frags: list[dict], R: dict, dpr: float, W: int, H: int) -> list[dict]:
    out = []
    for f in frags:
        l, t, w, h = f["box"]
        x0 = max(0, math.floor((l - R["x"]) * dpr))
        y0 = max(0, math.floor((t - R["y"]) * dpr))
        x1 = min(W, math.ceil((l + w - R["x"]) * dpr))
        y1 = min(H, math.ceil((t + h - R["y"]) * dpr))
        text = " ".join(f["text"].split())
        if text and x1 > x0 and y1 > y0:
            out.append({"text": text, "box": [x0, y0, x1 - x0, y1 - y0]})
    return out


class Renderer:
    def __enter__(self):
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch()
        return self

    def __exit__(self, *exc):
        self._browser.close()
        self._pw.stop()

    def _route(self, route, html: str):
        url = route.request.url
        if url.startswith(f"{HOST}/font/"):
            p = Path(urllib.parse.unquote(url[len(f"{HOST}/font/"):]))
            route.fulfill(status=200, body=p.read_bytes(), headers={"Content-Type": "font/ttf",
                                                                     "Access-Control-Allow-Origin": "*"})
        elif url == f"{HOST}/page.html":
            route.fulfill(status=200, body=html.encode("utf-8"), headers={"Content-Type": "text/html; charset=utf-8"})
        else:
            route.abort()

    def render_html(self, html: str, dpr: float, crop: str = "viewport", meta: dict | None = None) -> Sample:
        ctx = self._browser.new_context(viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]},
                                        device_scale_factor=dpr)
        try:
            page = ctx.new_page()
            page.route(f"{HOST}/**", lambda route: self._route(route, html))
            page.goto(f"{HOST}/page.html", wait_until="load")
            page.evaluate("document.fonts.ready.then(() => true)")
            page.add_script_tag(content=JS)
            if crop == "element" and page.locator("#crop").count():
                R = _snap_region(page.locator("#crop").bounding_box())
            else:
                R = {"x": 0, "y": 0, "w": VIEWPORT[0], "h": VIEWPORT[1]}
            hidden = page.evaluate("R => window.__gt.prune(R)", R)
            page.evaluate("window.__gt.freezeIgnored()")
            page.evaluate("document.fonts.ready.then(() => true)")
            frags = page.evaluate("R => window.__gt.extract(R)", R)
            clip = {"x": R["x"], "y": R["y"], "width": R["w"], "height": R["h"]}
            shot = dict(clip=clip, animations="disabled", caret="hide", type="png")
            png = page.screenshot(**shot)
            page.add_style_tag(content=TRANSPARENT_CSS)
            png_clear = page.screenshot(**shot)
        finally:
            ctx.close()
        a, b = _gray(png), _gray(png_clear)
        ink = np.abs(a - b) > INK_THRESHOLD
        H, W = a.shape
        gt = dict(meta or {}, width=W, height=H, region_css=R, hidden=hidden,
                  fragments=_to_px(frags, R, dpr, W, H))
        return Sample(png=png, ink=ink, gt=gt, html=html)

    def render_spec(self, spec: SampleSpec) -> Sample:
        html = templates.build_html(spec, url_for)
        return self.render_html(html, spec.dpr, spec.crop, spec.meta())


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


_worker: Renderer | None = None


def _init_worker():
    global _worker
    _worker = Renderer().__enter__()


def _render_one(args: tuple[SampleSpec, str]) -> tuple[str, str, str]:
    spec, out = args
    s = _worker.render_spec(spec)
    d = Path(out)
    gt_bytes = json.dumps(s.gt, ensure_ascii=False, indent=1).encode("utf-8")
    (d / f"{spec.id}.png").write_bytes(s.png)
    (d / f"{spec.id}.json").write_bytes(gt_bytes)
    Image.fromarray(s.ink.astype(np.uint8) * 255).convert("1").save(d / f"{spec.id}.ink.png", optimize=True)
    (d / f"{spec.id}.html").write_text(s.html, encoding="utf-8")
    return spec.id, _sha(s.png), _sha(gt_bytes)


def render_specs(specs: list[SampleSpec], out: Path, workers: int = 4) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    fonts_mod.fetch_fonts()
    with ProcessPoolExecutor(max_workers=workers, initializer=_init_worker) as ex:
        rows = list(ex.map(_render_one, [(s, str(out)) for s in specs]))
    files = {i: {"png": p, "json": j} for i, p, j in sorted(rows)}
    corpus_hash = _sha(json.dumps(files, sort_keys=True).encode())
    manifest = {"n": len(files), "files": files, "corpus_hash": corpus_hash}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def render_split(split: str, workers: int = 4) -> Path:
    out = paths.corpus_dir(split)
    m = render_specs(build_specs(split), out, workers)
    m["split"] = split
    (out / "manifest.json").write_text(json.dumps(m, indent=1))
    return out


def load_sample(split: str, sid: str) -> tuple[dict, np.ndarray]:
    d = paths.corpus_dir(split)
    gt = json.loads((d / f"{sid}.json").read_text(encoding="utf-8"))
    ink = np.asarray(Image.open(d / f"{sid}.ink.png").convert("L")) > 127
    return gt, ink


WILD_URLS = {
    "wild-wiki-bangkok": "https://th.wikipedia.org/wiki/กรุงเทพมหานคร",
    "wild-wiki-python": "https://th.wikipedia.org/wiki/ภาษาไพทอน",
    "wild-wiki-iphone": "https://th.wikipedia.org/wiki/ไอโฟน",
    "wild-capz-landing": "https://capz.yadobi.com/",
}


def render_wild(dpr: float = 2.0) -> dict:
    """Real pages (network): GT from the same DOM extractor, kept only if ink coverage holds.
    Supplementary evidence, not gated; nothing from here is committed."""
    from playwright.sync_api import sync_playwright

    from .check import coverage, problems

    out = paths.corpus_dir("wild")
    out.mkdir(parents=True, exist_ok=True)
    files, dropped = {}, {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for sid, url in WILD_URLS.items():
            ctx = browser.new_context(viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]}, device_scale_factor=dpr)
            try:
                page = ctx.new_page()
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.evaluate("document.fonts.ready.then(() => true)")
                page.add_script_tag(content=JS)
                R = {"x": 0, "y": 0, "w": VIEWPORT[0], "h": VIEWPORT[1]}
                page.evaluate("R => window.__gt.prune(R)", R)
                frags = page.evaluate("R => window.__gt.extract(R)", R)
                shot = dict(animations="disabled", caret="hide", type="png")
                png = page.screenshot(**shot)
                page.add_style_tag(content=TRANSPARENT_CSS)
                clear = page.screenshot(**shot)
            except Exception as e:  # network or page errors: record and move on
                dropped[sid] = str(e)[:200]
                continue
            finally:
                ctx.close()
            a, b = _gray(png), _gray(clear)
            ink = np.abs(a - b) > INK_THRESHOLD
            H, W = a.shape
            gt = {"id": sid, "split": "wild", "template": "wild", "url": url, "dpr": dpr, "width": W, "height": H,
                  "fragments": _to_px(frags, R, dpr, W, H)}
            cov = coverage(gt, ink)
            if cov < 0.99:
                dropped[sid] = f"coverage {cov:.4f}"
                continue
            bad = [p for p in problems(gt, ink) if not p.startswith("coverage")]
            gt["fragments"] = [f for f in gt["fragments"] if f"invisible text {f['text'][:20]!r}" not in bad]
            gt_bytes = json.dumps(gt, ensure_ascii=False, indent=1).encode("utf-8")
            (out / f"{sid}.png").write_bytes(png)
            (out / f"{sid}.json").write_bytes(gt_bytes)
            files[sid] = {"png": _sha(png), "json": _sha(gt_bytes), "coverage": round(cov, 4)}
    manifest = {"split": "wild", "n": len(files), "files": files, "dropped": dropped,
                "corpus_hash": _sha(json.dumps(files, sort_keys=True).encode())}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    return manifest
