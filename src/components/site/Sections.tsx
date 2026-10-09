"use client";

import { ArrowRight, Crop, Droplet, Highlighter, Image as ImageIcon, Magnet, Pencil, Search, Shapes, Smile, Type, ArrowUpRight, type LucideIcon } from "lucide-react";
import { MediaSlot } from "./MediaSlot";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";
import { ThaiText } from "./ThaiText";
import { Kbd } from "./Kbd";

/** Thai-first: the claim neighbouring apps can't make, told honestly (Thai OCR is macOS-only). */
export function ThaiFirst() {
  const { t } = useT();
  const items: Array<[TKey, TKey]> = [
    ["site.thai.ui.title", "site.thai.ui.desc"],
    ["site.thai.text.title", "site.thai.text.desc"],
    ["site.thai.ocr.title", "site.thai.ocr.desc"],
    ["site.thai.keys.title", "site.thai.keys.desc"],
  ];
  return (
    <section className="paper thai" id="thai" aria-labelledby="thai-title">
      <div className="wrap">
        <div className="paper-head">
          <h2 id="thai-title"><ThaiText>{t("site.thai.title")}</ThaiText></h2>
          <p>{t("site.thai.desc")}</p>
        </div>
        <div className="thai-grid">
          <MediaSlot id="thai-text" />
          <dl className="facts">
            {items.map(([title, desc]) => (
              <div key={title}>
                <dt><ThaiText>{t(title)}</ThaiText></dt>
                <dd>{t(desc)}</dd>
              </div>
            ))}
          </dl>
          <MediaSlot id="settings-th" />
        </div>
      </div>
    </section>
  );
}

const TOOLS: Array<[LucideIcon, TKey]> = [
  [ArrowUpRight, "site.tool.arrow"], [Shapes, "site.tool.shapes"], [Type, "site.tool.text"], [Pencil, "site.tool.pen"],
  [Highlighter, "site.tool.highlighter"], [Search, "site.tool.magnify"], [Droplet, "site.tool.blur"], [Smile, "site.tool.sticker"],
  [ImageIcon, "site.tool.image"], [Crop, "site.tool.crop"], [Magnet, "site.tool.snap"],
];

/** Editor keys (v0.16–v0.17): undo/redo, duplicate, nudge. Mac glyphs; the note covers Windows. */
const EDIT_KEYS: Array<[string[][], TKey]> = [
  [[["⌘", "Z"], ["⌘", "⇧", "Z"]], "site.key.undo"],
  [[["⌘", "D"]], "site.key.dup"],
  [[["←", "↑", "↓", "→"]], "site.key.nudge"],
];

/** The editor's tools as its own toolbar, plus four close-ups in a mosaic of unequal plates. */
export function Annotate() {
  const { t } = useT();
  return (
    <section className="screen ann" aria-labelledby="ann-title">
      <div className="wrap">
        <div className="ch-head">
          <h2 id="ann-title"><ThaiText>{t("site.ann.title")}</ThaiText></h2>
          <p>{t("site.ann.desc")}</p>
        </div>
        <ul className="toolrail" aria-label={t("site.ann.tools")}>
          {TOOLS.map(([Icon, key]) => (
            <li key={key}><Icon aria-hidden />{t(key)}</li>
          ))}
          <li><span className="pin-ico" aria-hidden>1</span>{t("site.tool.pin")}</li>
        </ul>
        <div className="editkeys" role="group" aria-label={t("site.ann.keys")}>
          {EDIT_KEYS.map(([groups, label]) => (
            <div key={label} className="ek">
              <span className="keys">
                {groups.map((g, i) => (
                  <span key={i} className="kgroup">{g.map((k) => <Kbd key={k} k={k} />)}</span>
                ))}
              </span>
              <span className="ek-label"><ThaiText>{t(label)}</ThaiText></span>
            </div>
          ))}
          <p className="ek-note">{t("site.key.note")}</p>
        </div>
        <div className="mosaic">
          <div className="m-a"><MediaSlot id="tool-arrow" /></div>
          <div className="m-b"><MediaSlot id="tool-pins" /></div>
          <div className="m-c"><MediaSlot id="tool-magnify" /></div>
          <div className="m-d"><MediaSlot id="tool-blur" /></div>
        </div>
      </div>
    </section>
  );
}

export function Ocr() {
  const { t } = useT();
  return (
    <section className="paper ocr" aria-labelledby="ocr-title">
      <div className="wrap ocr-grid">
        <div>
          <h2 id="ocr-title"><ThaiText>{t("site.ocr.title")}</ThaiText></h2>
          <p className="lede">{t("site.ocr.desc")}</p>
          <p className="note">{t("site.ocr.note")}</p>
        </div>
        <MediaSlot id="ocr" />
      </div>
    </section>
  );
}

export function Workspaces() {
  const { t } = useT();
  return (
    <section className="screen ws" aria-labelledby="ws-title">
      <div className="wrap">
        <div className="ch-head">
          <h2 id="ws-title"><ThaiText>{t("site.ws.title")}</ThaiText></h2>
          <p>{t("site.ws.desc")}</p>
        </div>
        <div className="ws-grid">
          <div className="ws-main">
            <MediaSlot id="workspaces" />
            <h3><ThaiText>{t("site.ws.ws.title")}</ThaiText></h3>
            <p>{t("site.ws.ws.desc")}</p>
          </div>
          <div className="ws-side">
            <MediaSlot id="history-preview" />
            <h3><ThaiText>{t("site.ws.hist.title")}</ThaiText></h3>
            <p>{t("site.ws.hist.desc")}</p>
          </div>
          <div className="ws-update">
            <h3><ThaiText>{t("site.ws.update.title")}</ThaiText></h3>
            <p>{t("site.ws.update.desc")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TryWeb() {
  const { t } = useT();
  return (
    <section className="paper web" aria-labelledby="web-title">
      <div className="wrap web-grid">
        <div>
          <h2 id="web-title"><ThaiText>{t("site.web.title")}</ThaiText></h2>
          <p className="lede">{t("site.web.desc")}</p>
          <a className="btn btn-primary" href="/paste">{t("hero.tryWeb")}<ArrowRight aria-hidden /></a>
          <p className="note">{t("site.web.note")}</p>
        </div>
        <MediaSlot id="paste-mobile" frame="phone" />
      </div>
    </section>
  );
}
