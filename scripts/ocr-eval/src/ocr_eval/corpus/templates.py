"""Screens the corpus is made of: plain HTML/CSS imitations of the app types
people screenshot (chat, settings, spreadsheet, article, terminal, editor,
dialog, menus). Each template marks the region an "area" capture would take
with id="crop". Rules every template keeps so the ground truth stays exact:
  * no overflow clipping or ellipsis on text (render.py hides anything the
    capture region cuts, so a half-visible line never reaches the image);
  * emoji go through esc(), which wraps them in data-gt-ignore;
  * neighbouring text blocks sit at least ~1em apart."""
from __future__ import annotations

import html
import random
import re

from .. import phrases
from . import fonts
from .spec import SampleSpec

EMOJI = re.compile("([\U0001F300-\U0001FAFF☀-➿⭐✅❌️]+)")


def esc(s: str) -> str:
    return EMOJI.sub(r'<span data-gt-ignore>\1</span>', html.escape(s))


class Content:
    def __init__(self, rng: random.Random, split: str):
        self.r = rng
        self.p = phrases.pool(split)

    def pick(self, kind: str, min_len: int = 0) -> str:
        cands = [x for x in self.p[kind] if len(x) >= min_len] or self.p[kind]
        return self.r.choice(cands)

    def line(self) -> str:
        """A UI line: mixed scripts are the point, so they get the largest share."""
        kind = self.r.choices(["mixed", "ui_th", "ui_en", "prose_th"], [40, 30, 20, 10])[0]
        return self.pick(kind)

    def label(self) -> str:
        kind = self.r.choices(["ui_th", "ui_en", "mixed"], [55, 30, 15])[0]
        return min((self.pick(kind) for _ in range(3)), key=len)

    def prose(self, n: int) -> str:
        parts = []
        for _ in range(n):
            kind = self.r.choices(["prose_th", "ui_th", "mixed"], [45, 35, 20])[0]
            parts.append(self.pick(kind, min_len=24 if kind == "ui_th" else 0))
        return " ".join(parts)

    def price(self) -> str:
        return f"{self.r.randint(10, 99999):,}.{self.r.choice(['00', '50', '25'])}"

    def date(self) -> str:
        months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
        if self.r.random() < 0.5:
            return f"{self.r.randint(1, 28)} {self.r.choice(months)} {self.r.choice([2568, 2569])}"
        return f"{self.r.randint(1, 28):02d}/{self.r.randint(1, 12):02d}/2026"

    def time(self) -> str:
        return f"{self.r.randint(0, 23):02d}:{self.r.randint(0, 59):02d}"


def theme_css(theme: str, rng: random.Random) -> str:
    if theme == "light":
        v = dict(bg="#ffffff", panel="#f6f8fa", fg="#1f2328", pfg="#1f2328", muted="#59636e", pmuted="#59636e", accent="#0969da",
                 afg="#ffffff", border="#d1d9e0")
    elif theme == "dark":
        v = dict(bg="#0d1117", panel="#161b22", fg="#e6edf3", pfg="#e6edf3", muted="#9198a1", pmuted="#9198a1", accent="#2f81f7",
                 afg="#ffffff", border="#30363d")
    else:
        h = rng.randrange(360)
        v = dict(bg=f"hsl({h} 55% 38%)", panel=f"hsl({h} 40% 95%)", fg="#ffffff", pfg=f"hsl({h} 50% 14%)",
                 muted="rgba(255,255,255,.78)", pmuted=f"hsl({h} 25% 36%)", accent=f"hsl({(h + 180) % 360} 60% 40%)", afg="#ffffff",
                 border=f"hsl({h} 30% 80%)")
    return ":root{" + "".join(f"--{k}:{val};" for k, val in v.items()) + "}"


BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:800px;overflow:hidden}
body{background:var(--bg);color:var(--fg);font-family:var(--ui);font-size:var(--fs);line-height:1.6;
  -webkit-font-smoothing:antialiased}
.panel{background:var(--panel);color:var(--pfg)}
.muted{color:var(--muted)} .panel .muted{color:var(--pmuted)} .small{font-size:calc(var(--fs)*0.86)} .big{font-size:calc(var(--fs)*1.35);font-weight:700}
.btn{display:inline-block;padding:.3em 1em;border-radius:6px;background:var(--accent);color:var(--afg)}
.btn.ghost{background:transparent;color:var(--pfg);border:1px solid var(--border)}
.row{display:flex;align-items:center;gap:1.2em}
"""


def page(spec: SampleSpec, body: str, css: str, rng: random.Random, url_for) -> str:
    f = fonts.FONTS[spec.font]
    faces = fonts.font_face_css(spec.font, url_for)
    mono = fonts.FONTS[fonts.MONO]
    if spec.template in ("terminal", "code"):
        faces += "\n" + fonts.font_face_css(fonts.MONO, url_for)
    vars_ = (f':root{{--ui:"{f.family}",sans-serif;--mono:"{mono.family}","{f.family}",monospace;'
             f"--fs:{spec.css_px}px}}")
    return (f"<!doctype html><html lang=th><head><meta charset=utf-8><style>{faces}\n{theme_css(spec.theme, rng)}"
            f"\n{vars_}\n{BASE_CSS}\n{css}</style></head><body>{body}</body></html>")


# --- templates ---------------------------------------------------------------

def chat(c: Content) -> tuple[str, str]:
    msgs = []
    for _ in range(c.r.randint(6, 9)):
        me = c.r.random() < 0.45
        text = esc(c.line())
        if c.r.random() < 0.25:
            text += " " + esc(c.r.choice(["😂", "👍", "🙏", "❤️", "🎉"]))
        name = "" if me else f'<div class="small muted">{esc(c.label())}</div>'
        msgs.append(f'<div class="msg {"me" if me else ""}">{name}<div class="bubble">{text}</div>'
                    f'<div class="small muted t">{c.time()}</div></div>')
    body = (f'<div class="app"><header class="bar big">{esc(c.label())} ({c.r.randint(3, 40)})</header>'
            f'<div class="msgs panel" id="crop">{"".join(msgs)}</div>'
            f'<footer class="input panel"><span class="muted">{esc(c.label())}…</span></footer></div>')
    css = """.app{display:flex;flex-direction:column;height:800px}.bar{padding:.6em 1.2em}
.msgs{flex:1;padding:1.2em 2em;display:flex;flex-direction:column;gap:1em}
.msg{max-width:62%;display:flex;flex-direction:column;gap:.15em}.msg.me{align-self:flex-end;align-items:flex-end}
.bubble{padding:.45em .9em;border-radius:14px;background:var(--bg);color:var(--fg)}
.msg.me .bubble{background:var(--accent);color:var(--afg)}.input{padding:.7em 1.2em;border-top:1px solid var(--border)}"""
    return body, css


def settings(c: Content) -> tuple[str, str]:
    nav = "".join(f'<div class="nav {"on" if i == 1 else ""}">{esc(c.label())}</div>' for i in range(6))
    rows = []
    for _ in range(c.r.randint(5, 7)):
        ctl = c.r.choice(["toggle", "select", "button"])
        if ctl == "toggle":
            ctrl = '<div class="toggle"><div class="knob"></div></div>'
        elif ctl == "select":
            ctrl = f'<div class="select">{esc(c.label())} ▾</div>'
        else:
            ctrl = f'<div class="btn ghost">{esc(c.label())}</div>'
        rows.append(f'<div class="srow"><div class="lab"><div><b>{esc(c.label())}</b></div>'
                    f'<div class="small muted">{esc(c.line())}</div></div>{ctrl}</div>')
    body = (f'<div class="wrap"><aside class="side">{nav}</aside><main class="main panel" id="crop">'
            f'<h2 class="big">{esc(c.label())}</h2>{"".join(rows)}</main></div>')
    css = """.wrap{display:flex;height:800px}.side{width:260px;padding:1.5em 1em;display:flex;flex-direction:column;gap:.5em}
.nav{padding:.3em .8em;border-radius:6px}.nav.on{background:var(--accent);color:var(--afg)}
.main{flex:1;padding:1.6em 2.4em;display:flex;flex-direction:column;gap:1.1em}
.srow{display:flex;justify-content:space-between;align-items:center;gap:3em;padding-bottom:.9em;border-bottom:1px solid var(--border)}
.toggle{width:2.6em;height:1.4em;border-radius:1em;background:var(--accent);position:relative;flex:none}
.knob{position:absolute;right:.15em;top:.15em;width:1.1em;height:1.1em;border-radius:50%;background:#fff}
.select{border:1px solid var(--border);border-radius:6px;padding:.2em .8em;flex:none}.lab{max-width:70%}"""
    return body, css


def table(c: Content) -> tuple[str, str]:
    ncol = c.r.randint(4, 5)
    head = "".join(f"<th>{esc(c.label())}</th>" for _ in range(ncol))
    kinds = [c.r.choice(["label", "line", "price", "date", "num"]) for _ in range(ncol)]
    kinds[0] = "line"

    def cell(k: str) -> str:
        return {"label": lambda: esc(c.label()), "line": lambda: esc(c.line()), "price": c.price,
                "date": c.date, "num": lambda: str(c.r.randint(0, 9999))}[k]()

    rows = "".join("<tr>" + "".join(f"<td>{cell(k)}</td>" for k in kinds) + "</tr>"
                   for _ in range(c.r.randint(9, 13)))
    body = (f'<div class="tb row"><span class="big">{esc(c.label())}</span><span class="btn">Export CSV</span></div>'
            f'<div class="tw panel" id="crop"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>')
    css = """.tb{padding:1em 1.5em;justify-content:space-between}.tw{margin:0 1.5em;padding:.5em}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.35em 1.1em;border:1px solid var(--border);vertical-align:top;max-width:22em}
th{font-weight:700}tbody tr:nth-child(even){background:color-mix(in srgb,var(--panel) 85%,var(--fg) 6%)}"""
    return body, css


def article(c: Content) -> tuple[str, str]:
    paras = "".join(f"<p>{esc(c.prose(c.r.randint(2, 4)))}</p>" for _ in range(c.r.randint(3, 4)))
    body = (f'<div class="addr panel small">https://www.example.co.th/news/{c.r.randint(1000, 9999)}</div>'
            f'<article id="crop"><h1>{esc(c.line())}</h1>'
            f'<div class="small muted">{esc(c.label())} · {c.date()} · {c.r.randint(2, 9)} min</div>{paras}</article>')
    css = """.addr{margin:.6em 1em;padding:.3em 1em;border-radius:20px}article{max-width:780px;margin:1.2em auto;padding:0 1em}
h1{font-size:calc(var(--fs)*1.7);line-height:1.4;margin-bottom:.3em}p{margin-top:1em}"""
    return body, css


def terminal(c: Content) -> tuple[str, str]:
    lines = []
    for _ in range(c.r.randint(9, 14)):
        r = c.r.random()
        if r < 0.3:
            cmd = c.r.choice(["git log --oneline -5", "pnpm test:unit", "ls -la", "cat notes.txt",
                              "git commit -m \"fix\"", "cargo build --release"])
            lines.append(f'<div><span class="pr">user@host ~/project $</span> {esc(cmd)}</div>')
        elif r < 0.6:
            h = "".join(c.r.choice("0123456789abcdef") for _ in range(7))
            lines.append(f'<div><span class="hs">{h}</span> {esc(c.line())}</div>')
        else:
            lines.append(f"<div>{esc(c.line())}</div>")
    body = (f'<div class="term panel" id="crop"><div class="tt small muted">zsh — 120×40</div>'
            f'<div class="tl">{"".join(lines)}</div></div>')
    css = """.term{margin:1.5em;border-radius:10px;border:1px solid var(--border);background:var(--panel);color:var(--pfg);
font-family:var(--mono)}.tt{padding:.3em 1em;border-bottom:1px solid var(--border);text-align:center}
.tl{padding:.8em 1.2em;display:flex;flex-direction:column;gap:.25em;white-space:pre}.pr{color:var(--accent)}.hs{color:var(--pmuted)}"""
    return body, css


def code(c: Content) -> tuple[str, str]:
    lines = []
    for i in range(c.r.randint(11, 16)):
        r = c.r.random()
        ind = "&nbsp;" * (4 * c.r.randint(0, 2))
        if r < 0.3:
            t = f'<span class="cm">// {esc(c.line())}</span>'
        elif r < 0.6:
            t = f'<span class="kw">const</span> msg{i} = <span class="st">"{esc(c.label())}"</span>;'
        elif r < 0.8:
            t = f'<span class="kw">function</span> handle{i}(event) {{'
        else:
            t = f'toast(<span class="st">"{esc(c.line())}"</span>);'
        lines.append(f'<div class="ln"><span class="no muted">{i + 1}</span><span>{ind}{t}</span></div>')
    body = (f'<div class="tabs small"><span class="tab">{esc(c.r.choice(["page.tsx", "ocr.ts", "main.rs"]))}</span></div>'
            f'<div class="ed panel" id="crop">{"".join(lines)}</div>')
    css = """.tabs{padding:.4em 1em}.tab{padding:.2em 1em;border-bottom:2px solid var(--accent)}
.ed{margin:0 1em;padding:.8em 0;font-family:var(--mono);white-space:pre}.ln{display:flex;gap:1.6em}
.no{width:3em;text-align:right;flex:none}.cm{color:var(--pmuted)}.kw{color:var(--accent);font-weight:700}.st{color:#1a7f37}"""
    return body, css


def dialog(c: Content) -> tuple[str, str]:
    bg = "".join(f'<div class="muted">{esc(c.line())}</div>' for _ in range(6))
    body = (f'<div class="bgapp">{bg}</div><div class="dim"></div>'
            f'<div class="modal panel" id="crop"><div class="big">{esc(c.label())}</div>'
            f"<p>{esc(c.prose(1))}</p><p>{esc(c.line())}</p>"
            f'<div class="row small"><span class="cb"></span>{esc(c.label())}</div>'
            f'<div class="row end"><span class="btn ghost">{esc(c.label())}</span><span class="btn">{esc(c.label())}</span></div>'
            f'</div><div class="toast panel small">{esc(c.line())}</div>')
    css = """.bgapp{padding:2em;display:flex;flex-direction:column;gap:1em}.dim{position:fixed;inset:0;background:rgba(0,0,0,.45);pointer-events:none}
.modal{position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);width:560px;padding:1.6em 2em;border-radius:12px;
display:flex;flex-direction:column;gap:1em;box-shadow:0 10px 40px rgba(0,0,0,.35)}.end{justify-content:flex-end}
.cb{width:1em;height:1em;border:2px solid var(--accent);border-radius:3px;flex:none}
.toast{position:fixed;right:1.5em;bottom:1.5em;max-width:420px;padding:.7em 1.2em;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.3)}"""
    return body, css


def menu(c: Content) -> tuple[str, str]:
    tabs = "".join(f'<span class="tab {"on" if i == 0 else ""}">{esc(c.label())}</span>' for i in range(5))
    crumbs = " / ".join(esc(c.label()) for _ in range(3))
    keys = ["Ctrl+S", "Ctrl+Shift+E", "⌘C", "Alt+F4", "F2", "Del", "Ctrl+Z", "⌘⇧4"]
    items = "".join(
        f'<div class="it"><span>{esc(c.label())}</span><span class="muted small">{esc(c.r.choice(keys))}</span></div>'
        + ('<div class="sep"></div>' if c.r.random() < 0.2 else "") for _ in range(c.r.randint(6, 9)))
    body = (f'<nav class="tabs row">{tabs}</nav><div class="crumb small muted">{crumbs}</div>'
            f'<div class="dd panel" id="crop">{items}</div>'
            f'<div class="side muted">{"".join(f"<div>{esc(c.line())}</div>" for _ in range(4))}</div>')
    css = """.tabs{padding:.6em 1.2em;gap:2em;border-bottom:1px solid var(--border)}.tab.on{font-weight:700}
.crumb{padding:.6em 1.2em}.dd{position:absolute;left:3em;top:7em;width:440px;padding:.5em 0;border-radius:8px;
border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25)}.it{display:flex;justify-content:space-between;gap:3em;padding:.3em 1.2em}
.sep{height:1px;background:var(--border);margin:.3em 0}.side{position:absolute;left:600px;top:7em;width:600px;display:flex;flex-direction:column;gap:1em}"""
    return body, css


def dense(c: Content) -> tuple[str, str]:
    cols = []
    for _ in range(3):
        blocks = "".join(f'<h3>{esc(c.line())}</h3><p>{esc(c.prose(3))}</p>' for _ in range(3))
        cols.append(f'<div class="col">{blocks}</div>')
    body = f'<div class="cols" id="crop">{"".join(cols)}</div>'
    css = """.cols{display:flex;gap:2.4em;padding:1.5em 2em}.col{flex:1}h3{font-size:calc(var(--fs)*1.15);margin-top:.6em}p{margin-top:.3em}"""
    return body, css


TEMPLATES = {"chat": chat, "settings": settings, "table": table, "article": article, "terminal": terminal,
             "code": code, "dialog": dialog, "menu": menu, "dense": dense}


def build_html(spec: SampleSpec, url_for) -> str:
    rng = random.Random(spec.seed)
    body, css = TEMPLATES[spec.template](Content(rng, spec.split))
    return page(spec, body, css, rng, url_for)
