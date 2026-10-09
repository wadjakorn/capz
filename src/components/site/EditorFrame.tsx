"use client";

import type { ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowRight, Circle, Minus, MoveHorizontal, Square,
  ArrowUpRight, ChevronDown, Copy, Crop, Droplet, Hash, Highlighter, Maximize2, Monitor, MousePointer2,
  Pencil, Redo2, Ruler, Search, Shapes, Smile, SquarePlus, SunMedium, Type, Undo2, type LucideIcon,
} from "lucide-react";
import type { EditorTool } from "./shots";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";

/* Sidebar rows in the editor's own chrome. Values are the app's defaults (src/lib/config.ts). */
const Row = ({ label, value, children }: { label: string; value?: string; children?: ReactNode }) => (
  <div className="row-l"><span>{label}</span>{value && <span className="v">{value}</span>}{children}</div>
);
const Chip = ({ color }: { color: string }) => <i className="chip" style={{ background: color }} />;
const Seg = ({ items, on }: { items: ReactNode[]; on: number }) => (
  <div className="seg">{items.map((x, i) => <span key={i} className={i === on ? "on" : undefined}>{x}</span>)}</div>
);
const Bar = ({ at }: { at: number }) => <div className="bar" style={{ ["--at" as string]: `${at}%` }} />;

function usePanel(tool: EditorTool): ReactNode {
  const { t } = useT();
  const head = (k: TKey) => <div className="h">{t(k)}</div>;
  switch (tool) {
    case "select":
      return (
        <>
          {head("site.ed.view")}
          <div className="r"><Maximize2 />1:1 · 79%</div>
          <div className="r"><Ruler />{t("site.ed.ruler")}</div>
          {head("site.ed.backdrop")}
          <div className="r on"><Hash />{t("site.ed.show")}</div>
          <Bar at={25} /><Bar at={25} />
          <div className="r on"><SunMedium />{t("site.ed.shadow")}</div>
        </>
      );
    case "arrow":
      return (
        <>
          {head("site.tool.arrow")}
          <Row label={t("site.ed.color")}><Chip color="#ef4444" /></Row>
          <Row label={t("site.ed.width")} value="4 px" /><Bar at={15} />
          <Row label={t("site.ed.heads")} />
          <Seg items={[<Minus key="n" />, <ArrowRight key="e" />, <MoveHorizontal key="b" />]} on={1} />
        </>
      );
    case "blur":
      return (
        <>
          {head("site.tool.blur")}
          <Row label={t("site.ed.strength")} value="16" /><Bar at={32} />
        </>
      );
    case "magnify":
      return (
        <>
          {head("site.tool.magnify")}
          <Row label={t("site.ed.zoom")} value="2×" /><Bar at={25} />
          <Row label={t("site.ed.border")}><Chip color="#facc15" /></Row>
          <Row label={t("site.ed.shape")} />
          <Seg items={[<Circle key="c" />, <Square key="s" />]} on={0} />
        </>
      );
    case "pin":
      return (
        <>
          {head("site.tool.pin")}
          <Row label={t("site.ed.color")}><Chip color="#E5342B" /></Row>
          <Row label={t("site.ed.numbering")} />
          <Seg items={["1-2-3", "A-Z"]} on={0} />
        </>
      );
    case "text":
      return (
        <>
          {head("site.tool.text")}
          <Row label={t("site.ed.font")} value="Sans" />
          <Row label={t("site.ed.size")} value="24 px" /><Bar at={20} />
          <Row label={t("site.ed.lineHeight")} value="1.35×" /><Bar at={30} />
          <Row label={t("site.ed.align")} />
          <Seg items={[<AlignLeft key="l" />, <AlignCenter key="c" />, <AlignRight key="r" />]} on={0} />
        </>
      );
    case "crop":
      return (
        <>
          {head("site.tool.crop")}
          <Row label={t("site.ed.aspect")} />
          <Seg items={[t("site.ed.free"), "16:9", "1:1"]} on={0} />
        </>
      );
    default:
      return null; // no mapped panel: toolbar only
  }
}

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
  const panel = usePanel(tool);
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
      <div className={`ed-body${panel ? "" : " no-side"}`}>
        <div className="ed-canvas">{children}</div>
        {panel && <div className="ed-side" aria-hidden>{panel}</div>}
      </div>
    </div>
  );
}
