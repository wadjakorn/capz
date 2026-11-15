"""Corpus generator: ground truth must match the pixels (gate H2).

These render with real headless Chromium, so they are the slowest tests in the
suite (a few seconds each)."""
import dataclasses
import hashlib
import re
import unicodedata

import pytest

from ocr_eval import phrases
from ocr_eval.corpus import check, render, spec

TONE_HEAVY = "น้ำที่นี่เมื่อชื่อปั๊ม ราคา 1,250 บาท"


def _squash(s: str) -> str:
    return "".join(unicodedata.normalize("NFC", s).split())


@pytest.fixture(scope="module")
def renderer():
    with render.Renderer() as r:
        yield r


def _smoke(**overrides) -> spec.SampleSpec:
    base = spec.build_specs("smoke")[0]
    return dataclasses.replace(base, **overrides)


def test_gt_roundtrip_tone_heavy(renderer):
    html = render.wrap_html(f'<p style="font-size:24px">{TONE_HEAVY}</p>', font_key="noto-sans-thai")
    s = renderer.render_html(html, dpr=2.0)
    got = "".join(f["text"] for f in s.gt["fragments"])
    assert _squash(got) == _squash(TONE_HEAVY)


@pytest.mark.parametrize("dpr", [1.0, 1.25, 1.5, 2.0])
def test_coverage_all_dprs(renderer, dpr):
    for template in ("settings", "table", "chat"):
        s = renderer.render_spec(_smoke(dpr=dpr, template=template, crop="viewport"))
        cov = check.coverage(s.gt, s.ink)
        assert cov >= 0.995, f"{template}@{dpr}: coverage {cov:.4f}"


def test_element_crop_offsets(renderer):
    s = renderer.render_spec(_smoke(crop="element", dpr=1.5, template="dialog"))
    w, h = s.gt["width"], s.gt["height"]
    assert s.gt["fragments"], "element crop produced no text"
    for f in s.gt["fragments"]:
        x, y, bw, bh = f["box"]
        assert 0 <= x and 0 <= y and x + bw <= w and y + bh <= h, f
    assert check.coverage(s.gt, s.ink) >= 0.995


EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def test_gt_ignore_excluded(renderer):
    s = renderer.render_spec(_smoke(template="chat"))
    assert "data-gt-ignore" in s.html, "chat template must contain ignored emoji to make this test meaningful"
    for f in s.gt["fragments"]:
        assert not EMOJI.search(f["text"]), f["text"]


def test_render_deterministic(renderer):
    sp = _smoke(template="table", dpr=1.25)
    a = renderer.render_spec(sp)
    b = renderer.render_spec(sp)
    assert hashlib.sha256(a.png).hexdigest() == hashlib.sha256(b.png).hexdigest()
    assert a.gt == b.gt


def test_split_disjoint_phrases():
    dev = {p for ps in phrases.pool("dev").values() for p in ps}
    test = {p for ps in phrases.pool("test").values() for p in ps}
    shared = {p for p in dev & test if len(p) >= 4}
    assert not shared, sorted(shared)[:5]
    assert len(dev) > 200 and len(test) > 200


def test_test_split_has_unseen_fonts():
    dev_fonts = {s.font for s in spec.build_specs("dev")}
    test_fonts = {s.font for s in spec.build_specs("test")}
    assert {"anuphan", "noto-sans-thai-looped"} <= test_fonts
    assert not ({"anuphan", "noto-sans-thai-looped"} & dev_fonts)


@pytest.mark.parametrize("template", ["terminal", "code", "article"])
def test_every_fragment_has_visible_ink(renderer, template):
    """GT text must be visible: a fragment with almost no ink is text no engine can read."""
    s = renderer.render_spec(_smoke(template=template, theme="tinted", dpr=1.0, crop="viewport"))
    for f in s.gt["fragments"]:
        x, y, w, h = f["box"]
        density = s.ink[y:y + h, x:x + w].mean()
        assert density >= check.MIN_INK_DENSITY, (f["text"], round(float(density), 4))


def test_overflowing_line_is_hidden(renderer):
    long = "ข้อความยาวมาก " * 40
    html = render.wrap_html(f'<div style="white-space:pre;width:300px">{long}</div><p>สั้น ๆ</p>')
    s = renderer.render_html(html, dpr=1.0)
    texts = [f["text"] for f in s.gt["fragments"]]
    assert texts == ["สั้น ๆ"], texts
    assert check.coverage(s.gt, s.ink) >= 0.995
