"use client";

import { Camera, Code2, MonitorSmartphone } from "lucide-react";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/dict";

type Feature = {
  icon: typeof Camera;
  title: TKey;
  desc: TKey;
  chip: "purple" | "cyan" | "pink";
};

const features: Feature[] = [
  {
    icon: Camera,
    title: "features.screenshot.title",
    desc: "features.screenshot.desc",
    chip: "purple",
  },
  {
    icon: Code2,
    title: "features.oss.title",
    desc: "features.oss.desc",
    chip: "cyan",
  },
  {
    icon: MonitorSmartphone,
    title: "features.platforms.title",
    desc: "features.platforms.desc",
    chip: "pink",
  },
];

export function Features() {
  const { t } = useT();
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-28 sm:py-32">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("features.kicker")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("features.title")}
          </h2>
        </div>

        <div className="mt-12 grid gap-4 sm:gap-6 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, desc, chip }) => (
            <div key={title} className="glass-card p-6 transition-transform hover:-translate-y-0.5">
              <span className={`icon-chip icon-chip--${chip}`}>
                <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-base font-medium text-foreground">{t(title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(desc)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
