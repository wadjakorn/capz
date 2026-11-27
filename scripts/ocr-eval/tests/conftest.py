import pytest

from ocr_eval.corpus import render

KNOWN_TEXT = "Hello สวัสดี 123"


@pytest.fixture(scope="session")
def known_line(tmp_path_factory):
    """One line at a known place: (png path, gt dict). The GT box comes from the DOM."""
    d = tmp_path_factory.mktemp("known")
    html = render.wrap_html(f'<p style="font-size:32px;padding:120px 160px">{KNOWN_TEXT}</p>',
                            font_key="noto-sans-thai")
    with render.Renderer() as r:
        s = r.render_html(html, dpr=1.0, meta={"id": "known"})
    p = d / "known.png"
    p.write_bytes(s.png)
    assert len(s.gt["fragments"]) == 1
    return p, s.gt


def iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    return inter / (aw * ah + bw * bh - inter)
