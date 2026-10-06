"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight, ChevronDown, Copy, Crop, Droplet, Hash, Highlighter, Maximize2, Monitor, MousePointer2,
  Pencil, Redo2, Ruler, Search, Shapes, Smile, SquarePlus, SunMedium, Type, Undo2, type LucideIcon,
} from "lucide-react";
import type { EditorTool } from "./shots";
import { useT } from "@/i18n/useT";

/** The editor's numbered-pin tool icon (lucide has no equivalent). */
function PinIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 9.5 12.5 8v8" />
    </svg>
  );
}

const TOOLS: Array<[EditorTool, LucideIcon | typeof PinIcon]> = [
  ["select", MousePointer2], ["arrow", ArrowUpRight], ["shapes", Shapes], ["text", Type], ["blur", Droplet],
  ["pen", Pencil], ["highlighter", Highlighter], ["magnify", Search], ["sticker", Smile], ["pin", PinIcon], ["crop", Crop],
];
/** Hidden first on narrow frames so the content area dominates. */
const OPTIONAL = new Set<EditorTool>(["pen", "sticker"]);
const PHONE_HIDDEN = new Set<EditorTool>(["shapes", "highlighter", "magnify"]);

/**
 * A faithful replica of the capz editor chrome (toolbar in its real order,
 * the active tool in the accent pill, the settings sidebar strip) around a
 * placeholder or a real shot. Colours come from the landing's --app-* tokens.
 */
export function EditorFrame({ tool = "select", children, label }: { tool?: EditorTool; children: ReactNode; label: string }) {
  const { t } = useT();
  return (
    <div className="ed" role="img" aria-label={label}>
      <div className="ed-bar" aria-hidden>
        <span className="t"><Copy /></span>
        <span className="chev"><ChevronDown /></span>
        <span className="sep" />
        <span className="t opt"><Monitor /></span>
        <span className="t dim opt"><Undo2 /></span>
        <span className="t dim opt"><Redo2 /></span>
        <span className="sep opt" />
        {TOOLS.map(([id, Icon]) => (
          <span
            key={id}
            className={`t${id === tool ? " on" : ""}${OPTIONAL.has(id) ? " opt" : ""}${PHONE_HIDDEN.has(id) && id !== tool ? " ph" : ""}`}
          >
            <Icon className="ico" />
          </span>
        ))}
        <span className="t end opt"><SquarePlus /></span>
      </div>
      <div className="ed-body">
        <div className="ed-canvas">{children}</div>
        <div className="ed-side" aria-hidden>
          <div className="h">{t("site.ed.view")}</div>
          <div className="r"><Maximize2 />1:1 · 79%</div>
          <div className="r"><Ruler />{t("site.ed.ruler")}</div>
          <div className="h">{t("site.ed.backdrop")}</div>
          <div className="r on"><Hash />{t("site.ed.show")}</div>
          <div className="bar" />
          <div className="bar" />
          <div className="r on"><SunMedium />{t("site.ed.shadow")}</div>
        </div>
      </div>
    </div>
  );
}
