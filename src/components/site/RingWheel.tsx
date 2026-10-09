"use client";

import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";

const MODES: TKey[] = ["site.mode.full", "site.mode.area", "site.mode.window", "site.mode.scroll", "site.ring.system"];

/** A segment label on up to two lines: at a U+200B in Thai, at the first space in a long English label. */
function lines(label: string): string[] {
  if (label.includes("\u200B")) return label.split("\u200B");
  const sp = label.indexOf(" ");
  return label.length > 10 && sp > 0 ? [label.slice(0, sp), label.slice(sp + 1)] : [label];
}

/** Diagram of command ring v2, drawn in the app-screen tokens (Area selected). */
export function RingWheel() {
  const { t } = useT();
  const cx = 260, cy = 260, R = 220, r = 92, sel = 1, n = MODES.length;
  const pt = (rad: number, a: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  return (
    <svg className="wheel" viewBox="0 0 520 520" role="img" aria-label={t("site.ring.aria")}>
      {MODES.map((key, i) => {
        const a0 = -Math.PI / 2 + (i - 0.5) * ((2 * Math.PI) / n) + 0.02;
        const a1 = a0 + (2 * Math.PI) / n - 0.04;
        const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
        const [tx, ty] = pt((R + r) / 2, (a0 + a1) / 2);
        return (
          <g key={key} className={i === sel ? "seg on" : "seg"}>
            <path d={`M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`} />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central">
              {lines(t(key)).map((l, j, all) => (
                <tspan key={j} x={tx} dy={j === 0 ? `${-(all.length - 1) * 0.6}em` : "1.2em"}>{l}</tspan>
              ))}
            </text>
          </g>
        );
      })}
      <circle className="hub" cx={cx} cy={cy} r={r - 12} />
      <text className="hub-t" x={cx} y={cy - 12} textAnchor="middle">{t("site.ring.hold")}</text>
      <text className="hub-k" x={cx} y={cy + 20} textAnchor="middle">⌘⇧Space</text>
    </svg>
  );
}
