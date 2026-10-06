"use client";

import { useEffect, useRef, useState } from "react";
import { GithubIcon } from "./GithubIcon";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";

// A specimen index: Thai letters stand in for section numbers.
const SECTIONS: Array<[string, string, TKey]> = [
  ["top", "ก", "nav.specimen"],
  ["capture", "ข", "nav.capture"],
  ["backdrops", "ค", "nav.backdrops"],
  ["thai", "ง", "nav.thai"],
  ["install", "จ", "nav.install"],
];

export function Nav() {
  const { lang, setLang, t } = useT();
  const [current, setCurrent] = useState("top");
  const ol = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const [id] of SECTIONS) {
      const n = document.getElementById(id);
      if (n) io.observe(n);
    }
    return () => io.disconnect();
  }, []);

  // keep the current pill in view when the index row scrolls sideways (phones)
  useEffect(() => {
    const list = ol.current;
    const a = list?.querySelector<HTMLElement>(`a[href="#${current}"]`);
    if (list && a && list.scrollWidth > list.clientWidth) list.scrollTo({ left: (a.parentElement?.offsetLeft ?? 0) - 16, behavior: "smooth" });
  }, [current]);

  return (
    <header className="index">
      <a className="skip" href="#capture">{t("nav.skip")}</a>
      <div className="wrap">
        <a className="wordmark" href="#top">
          <span className="mark" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" width={22} height={22} />
          </span>
          capz
        </a>
        <ol ref={ol} aria-label={t("nav.index")}>
          {SECTIONS.map(([id, letter, key]) => (
            <li key={id}>
              <a href={`#${id}`} aria-current={current === id ? "true" : undefined}>
                <span aria-hidden>{letter}</span>
                <b>{t(key)}</b>
              </a>
            </li>
          ))}
        </ol>
        <div className="lang" role="group" aria-label={t("nav.language")}>
          <button type="button" aria-pressed={lang === "th"} onClick={() => setLang("th")}>{t("nav.langTh")}</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>{t("nav.langEn")}</button>
        </div>
        <a className="gh" href="https://github.com/wadjakorn/capz" aria-label={t("nav.github")}>
          <GithubIcon />
        </a>
      </div>
    </header>
  );
}
