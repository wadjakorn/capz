"use client";

import { GithubIcon } from "./GithubIcon";
import { useT } from "@/i18n/useT";

export function Footer() {
  const { t } = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="foot">
      <div className="wrap foot-row">
        <div>
          <p className="foot-mark">capz</p>
          <p>{t("footer.copyright", { year })} · {t("footer.oss")}</p>
          <p>{t("footer.privacy")}</p>
        </div>
        <ul>
          <li><a href="https://github.com/wadjakorn/capz/issues">{t("footer.feedback")}</a></li>
          <li><a href="https://github.com/wadjakorn/capz"><GithubIcon className="gh-ico" />github.com/wadjakorn/capz</a></li>
        </ul>
      </div>
    </footer>
  );
}
