"use client";

import { FileDown, ScanLine } from "lucide-react";
import { Kbd } from "./Kbd";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MediaSlot } from "./MediaSlot";
import { RingWheel } from "./RingWheel";
import type { SlotId } from "./shots";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";
import { ThaiText } from "./ThaiText";

type Mode = { id: string; name: TKey; note: TKey; title: TKey; keys: string[] | null; slot: SlotId; beta?: boolean };

// Default hotkeys: src-tauri/src/shortcuts.rs (⌘ = Ctrl and ⌥ = Alt on Windows).
const MODES: Mode[] = [
  { id: "full", name: "site.mode.full", note: "site.mode.full.note", title: "site.mode.full.title", keys: ["⌘", "⌥", "⇧", "3"], slot: "full-screen" },
  { id: "area", name: "site.mode.area", note: "site.mode.area.note", title: "site.mode.area.title", keys: ["⌘", "⌥", "⇧", "4"], slot: "area-overlay" },
  { id: "window", name: "site.mode.window", note: "site.mode.window.note", title: "site.mode.window.title", keys: ["⌘", "⌥", "⇧", "5"], slot: "window-corners" },
  { id: "ring", name: "site.mode.ring", note: "site.mode.ring.note", title: "site.mode.ring.title", keys: ["⌘", "⇧", "Space"], slot: "ring-v2" },
  { id: "scroll", name: "site.mode.scroll", note: "site.mode.scroll.note", title: "site.mode.scroll.title", keys: null, slot: "scroll-capture", beta: true },
];

export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((k) => <Kbd key={k} k={k} />)}
    </span>
  );
}

/**
 * How an image gets in: paste, drop, or capture. The capture modes follow as
 * tabs driving one plate: a list on wide screens, pills on phones.
 */
export function CaptureChapter() {
  const { t } = useT();
  const [cur, setCur] = useState(0);
  const [swap, setSwap] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const m = MODES[cur];

  const select = (i: number, focus = false) => {
    if (i !== cur) { setCur(i); setSwap((n) => n + 1); }
    if (focus) tabs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const step = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (e.key === "Home" || e.key === "End") { e.preventDefault(); select(e.key === "Home" ? 0 : MODES.length - 1, true); return; }
    if (step == null) return;
    e.preventDefault();
    select((cur + step + MODES.length) % MODES.length, true);
  };
  const keysOf = (x: Mode): ReactNode => (x.keys ? <Keys keys={x.keys} /> : <span className="keys"><kbd className="wide">{t("site.mode.unbound")}</kbd></span>);
  const desc: ReactNode = m.id === "area"
    ? <>{t("site.mode.area.desc1")} <code className="inl">screencapture -i</code> {t("site.mode.area.desc2")}</>
    : t(`site.mode.${m.id}.desc` as TKey);

  return (
    <section className="screen" id="capture" aria-labelledby="cap-title">
      <div className="wrap">
        <div className="ch-head">
          <h2 id="cap-title"><ThaiText>{t("site.cap.title")}</ThaiText></h2>
          <p>{t("site.cap.desc")}</p>
        </div>

        <ul className="ways" aria-label={t("site.in.ways")}>
          <li>
            <Keys keys={["⌘", "V"]} />
            <h3><ThaiText>{t("site.in.paste.title")}</ThaiText></h3>
            <p>{t("site.in.paste.desc")}</p>
          </li>
          <li>
            <span className="keys"><FileDown className="way-ico" aria-hidden /></span>
            <h3><ThaiText>{t("site.in.drop.title")}</ThaiText></h3>
            <p>{t("site.in.drop.desc")}</p>
          </li>
          <li>
            <span className="keys"><ScanLine className="way-ico" aria-hidden /></span>
            <h3><ThaiText>{t("site.in.cap.title")}</ThaiText></h3>
            <p>{t("site.in.cap.desc")}</p>
          </li>
        </ul>

        <div className="modes">
          <div className="mode-list" role="tablist" aria-label={t("site.cap.modes")} onKeyDown={onKey}>
            {MODES.map((x, i) => (
              <button
                key={x.id}
                ref={(n) => { tabs.current[i] = n; }}
                id={`mode-tab-${x.id}`}
                className="mode"
                role="tab"
                type="button"
                aria-selected={i === cur}
                aria-controls="mode-plate"
                tabIndex={i === cur ? 0 : -1}
                onClick={() => select(i)}
                onMouseEnter={() => { if (matchMedia("(hover: hover) and (min-width: 601px)").matches) select(i); }}
              >
                <span className="name"><ThaiText>{t(x.name)}</ThaiText>{x.beta && <span className="tag">Beta</span>}</span>
                {keysOf(x)}
                <span className="note">{t(x.note)}</span>
              </button>
            ))}
            <p className="mode-foot">{t("site.cap.openEditor")} <Keys keys={["⌘", "⌥", "⇧", "0"]} /></p>
          </div>
          <div className={`mode-plate${swap ? " swap" : ""}`} key={swap} id="mode-plate" role="tabpanel" aria-labelledby={`mode-tab-${m.id}`}>
            <MediaSlot id={m.slot} />
            <div className="mode-cap">
              <h3><ThaiText>{t(m.title)}</ThaiText>{m.beta && <span className="tag">Beta</span>}</h3>
              <div className="mode-keys" aria-hidden>{keysOf(m)}</div>
              <p>{desc}</p>
            </div>
          </div>
        </div>

        <div className="ring-row">
          <div>
            <h3><ThaiText>{t("site.ring.title")}</ThaiText></h3>
            <p>{t("site.ring.desc")}</p>
            <p className="fine">{t("site.ring.note")}</p>
          </div>
          <RingWheel />
        </div>
      </div>
    </section>
  );
}
