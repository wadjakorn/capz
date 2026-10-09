"use client";

import { ArrowRight, Crop, RotateCcw, Droplet, Highlighter, Image as ImageIcon, Magnet, Pencil, Search, Shapes, Smile, Type, ArrowUpRight, type LucideIcon } from "lucide-react";
import { MediaSlot } from "./MediaSlot";
import type { SlotId } from "./shots";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";
import { ThaiText } from "./ThaiText";
import { Kbd } from "./Kbd";
import { KeyToggle } from "./keyPlatform";
import { SpecimenHero } from "./SpecimenHero";

/**
 * Thai-first: the reason to pick capz over neighbouring apps, told honestly
 * (Thai OCR is macOS-only). The measured specimen is the proof of "สระไม่ลอย".
 */
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
        <figure className="thai-spec">
          <SpecimenHero />
          <figcaption>{t("site.thai.specCap")}</figcaption>
        </figure>
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
          <div className="thai-search">
            <MediaSlot id="settings-th" />
            <h3><ThaiText>{t("site.thai.search.title")}</ThaiText></h3>
            <p>{t("site.thai.search.desc")}</p>
          </div>
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

/** Close-ups in two rows; each row's plates share a height (aspect ∝ column span: 7:5 beside 1:1). */
const PLATES: Array<[string, SlotId, TKey]> = [
  ["m-a", "tool-arrow", "site.tool.arrow"],
  ["m-b", "tool-pins", "site.tool.pin"],
  ["m-c", "tool-magnify", "site.tool.magnify"],
  ["m-d", "tool-blur", "site.tool.blur"],
];

/** The editor's tools as its own toolbar, plus four close-ups in a mosaic of unequal plates. */
export function Annotate() {
  const { t } = useT();
  return (
    <section className="screen ann" id="edit" aria-labelledby="ann-title">
      <div className="wrap">
        <div className="ch-head">
          <h2 id="ann-title"><ThaiText>{t("site.ann.title")}</ThaiText></h2>
          <p>{t("site.ann.desc")}</p>
        </div>
        <div className="lead-row">
          <MediaSlot id="hero-editor" />
          <div>
            <h3><ThaiText>{t("site.lead.title")}</ThaiText></h3>
            <p>{t("site.lead.desc")}</p>
          </div>
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
          <KeyToggle />
        </div>
        <div className="mosaic">
          {PLATES.map(([cls, id, label]) => (
            <div key={id} className={cls}>
              <MediaSlot id={id} />
              <p className="m-cap"><ThaiText>{t(label)}</ThaiText></p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The loop: paste → point it out → copy → next. Stacking images and the whole-image copy. */
const LOOP: Array<[string[] | null, TKey]> = [
  [["⌘", "V"], "site.loop.s1"],
  [null, "site.loop.s2"],
  [["⌘", "C"], "site.loop.s3"],
  [["⌘", "V"], "site.loop.s4"],
];

export function Loop() {
  const { t } = useT();
  return (
    <section className="paper loop" id="copy" aria-labelledby="loop-title">
      <div className="wrap">
        <div className="paper-head">
          <h2 id="loop-title"><ThaiText>{t("site.loop.title")}</ThaiText></h2>
          <p>{t("site.loop.desc")}</p>
        </div>
        <ol className="loop-steps" aria-label={t("site.loop.steps")}>
          {LOOP.map(([keys, label], i) => (
            <li key={label}>
              <span className="keys">
                {keys ? keys.map((k) => <Kbd key={k} k={k} />) : <span className="pin-ico" aria-hidden>1</span>}
              </span>
              <span className="ls-label"><ThaiText>{t(label)}</ThaiText></span>
              {i === LOOP.length - 1 && <RotateCcw className="ls-again" aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="loop-grid">
          <div>
            <MediaSlot id="combine" />
            <h3><ThaiText>{t("site.loop.combine.title")}</ThaiText></h3>
            <p>{t("site.loop.combine.desc")}</p>
          </div>
          <div className="loop-copy">
            <span className="keys big" aria-hidden><Kbd k="⌘" /><Kbd k="C" /></span>
            <h3><ThaiText>{t("site.loop.copy.title")}</ThaiText></h3>
            <p>{t("site.loop.copy.desc")}</p>
          </div>
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
