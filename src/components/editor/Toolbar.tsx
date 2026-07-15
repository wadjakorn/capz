"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  MousePointer2,
  ArrowUpRight,
  Square,
  Type,
  Droplet,
  Smile,
  MapPin,
  Crop,
  Pencil,
  Highlighter,
  Search,
  Minus,
  Spline,
  Waypoints,
  PenLine,
  ArrowLeftRight,
  Shapes as ShapesIcon,
  Circle as CircleIcon,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Undo2,
  Redo2,
  Trash2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Settings as SettingsIcon,
  Ruler,
  ScanText,
  Loader2,
  Monitor,
  Link2,
  Link2Off,
  ImageDown,
  BringToFront,
  SendToBack,
  ChevronsUp,
  ChevronsDown,
  type LucideIcon,
} from "lucide-react";
import { formatShortcut } from "@/lib/shortcuts";
import {
  useEditor,
  STICKERS,
  type Tool,
  type PinShapeKind,
  type PinTailDir,
  type RectShapeKind,
  type FreehandMode,
  type MagnifyShape,
  type ArrowHeads,
} from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import { useOcr } from "@/stores/ocr";
import { getStage, runPrepareExport } from "@/lib/stageBridge";
import { copyOnly, saveOnly, saveAndCopy } from "@/lib/exportImage";
import { describeExportError } from "@/lib/exportErrors";
import { effectiveTools, type AppConfig } from "@/lib/config";
import { ToolButton } from "./toolbar/ToolButton";
import { BackdropControl } from "./toolbar/BackdropControl";
import { useOverflowSlots } from "./toolbar/useOverflowSlots";
import { CaptureSplitButton, type CaptureKind } from "./toolbar/CaptureSplitButton";
import { ExportSplitButton, type ExportAction } from "./toolbar/ExportSplitButton";
import { NumberedPinIcon } from "./toolbar/NumberedPinIcon";
import { ZoomMenuButton } from "./toolbar/ZoomMenuButton";
import { OverflowMenu, type OverflowItem } from "./toolbar/OverflowMenu";
import { isTauriRuntime } from "@/lib/platform";

/** Tools carry a `group` so the palette can render meaning-based clusters
 * (separated by a divider) instead of one flat row. Grouping is by intent, not
 * appearance: blur (redact/hide) stays apart from highlighter (emphasize). */
type ToolGroup = "select" | "draw" | "redact" | "emphasis" | "content";
type ToolDef = { id: Tool; label: string; hint: string; icon: LucideIcon; group: ToolGroup };

/** Dashed horizontal line — no lucide equivalent, so a tiny inline SVG. */
function DashLineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray="3 3"
      className={className}
      aria-hidden
    >
      <line x1="1.5" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", hint: "V", icon: MousePointer2, group: "select" },
  // draw: vector tools
  { id: "arrow", label: "Arrow", hint: "A", icon: ArrowUpRight, group: "draw" },
  { id: "rect", label: "Shapes", hint: "R", icon: ShapesIcon, group: "draw" },
  { id: "pen", label: "Pen", hint: "D", icon: Pencil, group: "draw" },
  // redact: blur stands alone — it hides, it does not emphasize
  { id: "blur", label: "Blur", hint: "B", icon: Droplet, group: "redact" },
  // emphasis: draw the eye to something
  { id: "highlighter", label: "Highlighter", hint: "H", icon: Highlighter, group: "emphasis" },
  { id: "magnify", label: "Magnify", hint: "M", icon: Search, group: "emphasis" },
  // content & frame
  { id: "text", label: "Text", hint: "T", icon: Type, group: "content" },
  { id: "sticker", label: "Sticker", hint: "S", icon: Smile, group: "content" },
  { id: "pin", label: "Pin", hint: "P", icon: NumberedPinIcon as LucideIcon, group: "content" },
  { id: "crop", label: "Crop", hint: "C", icon: Crop, group: "content" },
];

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Sans", value: "system-ui, sans-serif" },
  { label: "Serif", value: "serif" },
  { label: "Mono", value: "ui-monospace, monospace" },
  { label: "Cursive", value: "cursive" },
];

type TextFontStyle = "normal" | "bold" | "italic" | "italic bold";
type TextDecoration =
  | ""
  | "underline"
  | "line-through"
  | "underline line-through";

function withBold(s: TextFontStyle, on: boolean): TextFontStyle {
  const italic = s.includes("italic");
  if (on) return italic ? "italic bold" : "bold";
  return italic ? "italic" : "normal";
}
function withItalic(s: TextFontStyle, on: boolean): TextFontStyle {
  const bold = s.includes("bold");
  if (on) return bold ? "italic bold" : "italic";
  return bold ? "bold" : "normal";
}
function withDeco(
  d: TextDecoration,
  which: "underline" | "line-through",
  on: boolean,
): TextDecoration {
  const has = (k: "underline" | "line-through") => d.includes(k);
  const u = which === "underline" ? on : has("underline");
  const s = which === "line-through" ? on : has("line-through");
  if (u && s) return "underline line-through";
  if (u) return "underline";
  if (s) return "line-through";
  return "";
}

export function Toolbar({
  onOpenSettings,
  onWebCapture,
  onWebClear,
}: {
  onOpenSettings?: () => void;
  /** Web build: capture the screen in-browser (getDisplayMedia). */
  onWebCapture?: () => void;
  /** Web build: drop the current image and annotations, back to empty state. */
  onWebClear?: () => void;
} = {}) {
  // Desktop-only chrome (capture, OCR, clear-workspace, settings) hides on
  // the web build. Defaults true so the prerendered HTML matches the desktop
  // webview; the web build flips it after hydration.
  const [tauriUi, setTauriUi] = useState(true);
  useEffect(() => setTauriUi(isTauriRuntime()), []);
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const hasImage = useEditor((s) => s.hasImage);
  const ocrMode = useOcr((s) => s.mode);
  const ocrStatus = useOcr((s) => s.status);
  const toggleOcr = useOcr((s) => s.toggle);
  const displayScale = useEditor((s) => s.displayScale);
  const stickerSelection = useEditor((s) => s.stickerSelection);
  const setStickerSelection = useEditor((s) => s.setStickerSelection);
  const stickerEntries = useStickers((s) => s.entries);
  const nextPinNumber = useEditor((s) => s.nextPinNumber);
  const setNextPinNumber = useEditor((s) => s.setNextPinNumber);
  const annotations = useEditor((s) => s.annotations);
  const selectedId = useEditor((s) => s.selectedId);
  const updateAnnotation = useEditor((s) => s.update);
  const reorderAnnotation = useEditor((s) => s.reorder);
  const pinsCfg = useSettings((s) => s.config.pins);
  const fullConfig = useSettings((s) => s.config);
  const toolsCfg = effectiveTools(fullConfig);
  const updateSettings = useSettings((s) => s.update);
  const setLastUsed = useSettings((s) => s.setLastUsed);
  const remember = fullConfig.general.rememberLastTool;

  const patchLastUsed = (patch: NonNullable<AppConfig["lastUsed"]>) => {
    const cur = fullConfig.lastUsed ?? {};
    const merged: NonNullable<AppConfig["lastUsed"]> = {
      ...cur,
      ...patch,
      rect: { ...cur.rect, ...patch.rect },
      arrow: { ...cur.arrow, ...patch.arrow },
      text: { ...cur.text, ...patch.text },
      blur: { ...cur.blur, ...patch.blur },
      pen: { ...cur.pen, ...patch.pen },
      highlighter: { ...cur.highlighter, ...patch.highlighter },
      magnify: { ...cur.magnify, ...patch.magnify },
      sticker: { ...cur.sticker, ...patch.sticker },
      pin: { ...cur.pin, ...patch.pin },
    };
    void setLastUsed(merged);
  };

  const [exporting, setExporting] = useState(false);
  // Remember the last non-null text background color so the ON/OFF toggle can
  // restore it without forcing the user to re-pick a color.
  const [lastBgColor, setLastBgColor] = useState("#ffffff");
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById("tool-options-slot"));
  }, []);

  const selected = selectedId
    ? annotations.find((a) => a.id === selectedId) ?? null
    : null;

  type ColorCtx = {
    label: string;
    value: string;
    onChange: (v: string) => void;
  };
  type NumCtx = {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
  };
  type TextStyleCtx = {
    fontStyle: TextFontStyle;
    textDecoration: TextDecoration;
    fontFamily: string;
    backgroundColor: string | null;
    bgPadding: number;
    setFontStyle: (v: TextFontStyle) => void;
    setTextDecoration: (v: TextDecoration) => void;
    setFontFamily: (v: string) => void;
    setBackgroundColor: (v: string | null) => void;
    setBgPadding: (v: number) => void;
  };
  type PinShapeCtx = {
    value: PinShapeKind;
    onChange: (v: PinShapeKind) => void;
  };
  type PinTailCtx = {
    value: PinTailDir;
    onChange: (v: PinTailDir) => void;
  };
  type RectShapeCtx = {
    value: RectShapeKind;
    onChange: (v: RectShapeKind) => void;
  };
  type PenModeCtx = {
    value: FreehandMode;
    onChange: (v: FreehandMode) => void;
  };
  type MagnifyShapeCtx = {
    value: MagnifyShape;
    onChange: (v: MagnifyShape) => void;
  };
  type ArrowHeadsCtx = {
    value: ArrowHeads;
    onChange: (v: ArrowHeads) => void;
  };
  type ToggleCtx = { value: boolean; onChange: (v: boolean) => void };
  let colorCtx: ColorCtx | null = null;
  let widthCtx: NumCtx | null = null;
  let sizeCtx: NumCtx | null = null;
  let cornerCtx: NumCtx | null = null;
  let penLevelCtx: NumCtx | null = null;
  let magnifyLinkCtx: ToggleCtx | null = null;
  // When borders are linked, the source width tracks the output at this ratio,
  // preserving the loupe's default proportions from a single "Border" control.
  const srcFromOut = (out: number) => Math.max(1, Math.round(out * 0.6));
  let rectShapeCtx: RectShapeCtx | null = null;
  let penModeCtx: PenModeCtx | null = null;
  let magnifyShapeCtx: MagnifyShapeCtx | null = null;
  let arrowHeadsCtx: ArrowHeadsCtx | null = null;
  let arrowDashCtx: ToggleCtx | null = null;
  let textStyleCtx: TextStyleCtx | null = null;
  let pinLabelCtx: ColorCtx | null = null;
  let pinBorderCtx: ColorCtx | null = null;
  let pinBorderWidthCtx: NumCtx | null = null;
  let pinShapeCtx: PinShapeCtx | null = null;
  let pinTailCtx: PinTailCtx | null = null;

  if (selected) {
    if (selected.type === "rect" || selected.type === "arrow") {
      // A headless line is drawn by the Shapes tool, so its color/width persist
      // under the "rect" slot alongside the other shapes.
      const slot =
        selected.type === "arrow" && selected.heads === "none"
          ? "rect"
          : selected.type;
      colorCtx = {
        label: "Stroke",
        value: selected.stroke,
        onChange: (v) => {
          updateAnnotation(selected.id, { stroke: v });
          if (remember) patchLastUsed({ [slot]: { strokeColor: v } });
          else void updateSettings("tools", { [slot]: { strokeColor: v } } as Partial<AppConfig["tools"]>);
        },
      };
      widthCtx = {
        label: "Width",
        value: selected.strokeWidth,
        min: 1,
        max: 20,
        step: 1,
        onChange: (v) => {
          updateAnnotation(selected.id, { strokeWidth: v });
          if (remember) patchLastUsed({ [slot]: { strokeWidth: v } });
          else void updateSettings("tools", { [slot]: { strokeWidth: v } } as Partial<AppConfig["tools"]>);
        },
      };
      if (selected.type === "rect") {
        const rectSel = selected;
        const curShape = rectSel.shape ?? toolsCfg.rect.shape;
        rectShapeCtx = {
          value: curShape,
          onChange: (v) => {
            updateAnnotation(rectSel.id, { shape: v });
            if (remember) patchLastUsed({ rect: { shape: v } });
            else void updateSettings("tools", { rect: { shape: v } } as Partial<AppConfig["tools"]>);
          },
        };
        if (curShape === "rect") {
          cornerCtx = {
            label: "Radius",
            value: rectSel.cornerRadius ?? toolsCfg.rect.cornerRadius,
            min: 0,
            max: 60,
            step: 1,
            onChange: (v) => {
              updateAnnotation(rectSel.id, { cornerRadius: v });
              if (remember) patchLastUsed({ rect: { cornerRadius: v } });
              else void updateSettings("tools", { rect: { cornerRadius: v } } as Partial<AppConfig["tools"]>);
            },
          };
        }
      }
      if (selected.type === "arrow" && selected.heads !== "none") {
        const arrowSel = selected;
        arrowHeadsCtx = {
          value: arrowSel.heads ?? "end",
          onChange: (v) => {
            updateAnnotation(arrowSel.id, { heads: v });
            if (remember) patchLastUsed({ arrow: { heads: v } });
            else void updateSettings("tools", { arrow: { heads: v } } as Partial<AppConfig["tools"]>);
          },
        };
        arrowDashCtx = {
          value: arrowSel.dash ?? false,
          onChange: (v) => {
            updateAnnotation(arrowSel.id, { dash: v });
            if (remember) patchLastUsed({ arrow: { dash: v } });
            else void updateSettings("tools", { arrow: { dash: v } } as Partial<AppConfig["tools"]>);
          },
        };
      }
      if (selected.type === "arrow" && selected.heads === "none") {
        // Headless line (from the Shapes tool): only the dash toggle applies.
        const lineSel = selected;
        arrowDashCtx = {
          value: lineSel.dash ?? false,
          onChange: (v) => {
            updateAnnotation(lineSel.id, { dash: v });
            if (remember) patchLastUsed({ arrow: { dash: v } });
            else void updateSettings("tools", { arrow: { dash: v } } as Partial<AppConfig["tools"]>);
          },
        };
      }
    } else if (selected.type === "pen") {
      const penSel = selected;
      colorCtx = {
        label: "Stroke",
        value: penSel.stroke,
        onChange: (v) => {
          updateAnnotation(penSel.id, { stroke: v });
          if (remember) patchLastUsed({ pen: { strokeColor: v } });
          else void updateSettings("tools", { pen: { strokeColor: v } } as Partial<AppConfig["tools"]>);
        },
      };
      widthCtx = {
        label: "Width",
        value: penSel.strokeWidth,
        min: 1,
        max: 40,
        step: 1,
        onChange: (v) => {
          updateAnnotation(penSel.id, { strokeWidth: v });
          if (remember) patchLastUsed({ pen: { strokeWidth: v } });
          else void updateSettings("tools", { pen: { strokeWidth: v } } as Partial<AppConfig["tools"]>);
        },
      };
      penModeCtx = {
        value: penSel.mode,
        onChange: (v) => {
          updateAnnotation(penSel.id, { mode: v });
          if (remember) patchLastUsed({ pen: { mode: v } });
          else void updateSettings("tools", { pen: { mode: v } } as Partial<AppConfig["tools"]>);
        },
      };
      if (penSel.mode === "polygon") {
        penLevelCtx = {
          label: "Straighten",
          value: penSel.polygonEpsilon ?? toolsCfg.pen.polygonEpsilon,
          min: 2,
          max: 40,
          step: 1,
          onChange: (v) => {
            updateAnnotation(penSel.id, { polygonEpsilon: v });
            if (remember) patchLastUsed({ pen: { polygonEpsilon: v } });
            else void updateSettings("tools", { pen: { polygonEpsilon: v } } as Partial<AppConfig["tools"]>);
          },
        };
      } else if (penSel.mode === "curve") {
        penLevelCtx = {
          label: "Curve",
          value: penSel.curveSmoothing ?? toolsCfg.pen.curveSmoothing,
          min: 0,
          max: 30,
          step: 1,
          onChange: (v) => {
            updateAnnotation(penSel.id, { curveSmoothing: v });
            if (remember) patchLastUsed({ pen: { curveSmoothing: v } });
            else void updateSettings("tools", { pen: { curveSmoothing: v } } as Partial<AppConfig["tools"]>);
          },
        };
      }
    } else if (selected.type === "highlighter") {
      const hSel = selected;
      colorCtx = {
        label: "Color",
        value: hSel.stroke,
        onChange: (v) => {
          updateAnnotation(hSel.id, { stroke: v });
          if (remember) patchLastUsed({ highlighter: { strokeColor: v } });
          else void updateSettings("tools", { highlighter: { strokeColor: v } } as Partial<AppConfig["tools"]>);
        },
      };
      widthCtx = {
        label: "Width",
        value: hSel.strokeWidth,
        min: 4,
        max: 100,
        step: 1,
        onChange: (v) => {
          updateAnnotation(hSel.id, { strokeWidth: v });
          if (remember) patchLastUsed({ highlighter: { strokeWidth: v } });
          else void updateSettings("tools", { highlighter: { strokeWidth: v } } as Partial<AppConfig["tools"]>);
        },
      };
      sizeCtx = {
        label: "Opacity",
        value: Math.round((hSel.opacity ?? toolsCfg.highlighter.opacity) * 100),
        min: 10,
        max: 100,
        step: 5,
        onChange: (v) => {
          updateAnnotation(hSel.id, { opacity: v / 100 });
          if (remember) patchLastUsed({ highlighter: { opacity: v / 100 } });
          else void updateSettings("tools", { highlighter: { opacity: v / 100 } } as Partial<AppConfig["tools"]>);
        },
      };
    } else if (selected.type === "magnify") {
      const mSel = selected;
      colorCtx = {
        label: "Border",
        value: mSel.stroke,
        onChange: (v) => {
          updateAnnotation(mSel.id, { stroke: v });
          if (remember) patchLastUsed({ magnify: { strokeColor: v } });
          else void updateSettings("tools", { magnify: { strokeColor: v } } as Partial<AppConfig["tools"]>);
        },
      };
      magnifyShapeCtx = {
        value: mSel.shape,
        onChange: (v) => {
          updateAnnotation(mSel.id, { shape: v });
          if (remember) patchLastUsed({ magnify: { shape: v } });
          else void updateSettings("tools", { magnify: { shape: v } } as Partial<AppConfig["tools"]>);
        },
      };
      sizeCtx = {
        label: "Zoom",
        value: mSel.zoom,
        min: 2,
        max: 8,
        step: 1,
        onChange: (v) => {
          updateAnnotation(mSel.id, { zoom: v });
          if (remember) patchLastUsed({ magnify: { zoom: v } });
          else void updateSettings("tools", { magnify: { zoom: v } } as Partial<AppConfig["tools"]>);
        },
      };
      widthCtx = {
        label: "Area",
        value: Math.round((mSel.areaOpacity ?? toolsCfg.magnify.areaOpacity) * 100),
        min: 0,
        max: 100,
        step: 5,
        onChange: (v) => {
          updateAnnotation(mSel.id, { areaOpacity: v / 100 });
          if (remember) patchLastUsed({ magnify: { areaOpacity: v / 100 } });
          else void updateSettings("tools", { magnify: { areaOpacity: v / 100 } } as Partial<AppConfig["tools"]>);
        },
      };
      // Border width: one "Border" control when linked (source tracks output at
      // 0.6×), or independent "Out"/"Src" sliders when unlinked.
      const mLinked = mSel.borderLinked ?? true;
      cornerCtx = {
        label: mLinked ? "Border" : "Out",
        value: mSel.strokeWidth,
        min: 1,
        max: 20,
        step: 1,
        onChange: (v) => {
          const patch = mLinked
            ? { strokeWidth: v, sourceStrokeWidth: srcFromOut(v) }
            : { strokeWidth: v };
          updateAnnotation(mSel.id, patch);
          if (remember) patchLastUsed({ magnify: patch });
          else void updateSettings("tools", { magnify: patch } as Partial<AppConfig["tools"]>);
        },
      };
      if (!mLinked) {
        penLevelCtx = {
          label: "Src",
          value: mSel.sourceStrokeWidth ?? srcFromOut(mSel.strokeWidth),
          min: 1,
          max: 20,
          step: 1,
          onChange: (v) => {
            updateAnnotation(mSel.id, { sourceStrokeWidth: v });
            if (remember) patchLastUsed({ magnify: { sourceStrokeWidth: v } });
            else void updateSettings("tools", { magnify: { sourceStrokeWidth: v } } as Partial<AppConfig["tools"]>);
          },
        };
      }
      magnifyLinkCtx = {
        value: mLinked,
        onChange: (next) => {
          // Re-linking snaps the source back to the proportional width.
          const patch = next
            ? { borderLinked: true, sourceStrokeWidth: srcFromOut(mSel.strokeWidth) }
            : { borderLinked: false };
          updateAnnotation(mSel.id, patch);
          if (remember) patchLastUsed({ magnify: patch });
          else void updateSettings("tools", { magnify: patch } as Partial<AppConfig["tools"]>);
        },
      };
      arrowDashCtx = {
        value: mSel.linkDash ?? toolsCfg.magnify.linkDash,
        onChange: (v) => {
          updateAnnotation(mSel.id, { linkDash: v });
          if (remember) patchLastUsed({ magnify: { linkDash: v } });
          else void updateSettings("tools", { magnify: { linkDash: v } } as Partial<AppConfig["tools"]>);
        },
      };
    } else if (selected.type === "text") {
      const baseText = () => ({
        fontSize: toolsCfg.text.fontSize,
        color: toolsCfg.text.color,
        fontStyle: toolsCfg.text.fontStyle,
        textDecoration: toolsCfg.text.textDecoration,
        fontFamily: toolsCfg.text.fontFamily,
        backgroundColor: toolsCfg.text.backgroundColor,
        backgroundPadding: toolsCfg.text.backgroundPadding,
      });
      colorCtx = {
        label: "Color",
        value: selected.fill,
        onChange: (v) => {
          updateAnnotation(selected.id, { fill: v });
          if (remember) patchLastUsed({ text: { color: v } });
          else void updateSettings("tools", { text: { ...baseText(), color: v } });
        },
      };
      sizeCtx = {
        label: "Size",
        value: selected.fontSize,
        min: 8,
        max: 96,
        step: 1,
        onChange: (v) => {
          updateAnnotation(selected.id, { fontSize: v });
          if (remember) patchLastUsed({ text: { fontSize: v } });
          else void updateSettings("tools", { text: { ...baseText(), fontSize: v } });
        },
      };
      const curStyle = (selected.fontStyle ?? "normal") as TextFontStyle;
      const curDeco = (selected.textDecoration ?? "") as TextDecoration;
      const curFamily = selected.fontFamily ?? toolsCfg.text.fontFamily;
      const curBg = selected.backgroundColor ?? null;
      textStyleCtx = {
        fontStyle: curStyle,
        textDecoration: curDeco,
        fontFamily: curFamily,
        backgroundColor: curBg,
        bgPadding: selected.bgPadding ?? toolsCfg.text.backgroundPadding,
        setFontStyle: (v) => {
          updateAnnotation(selected.id, { fontStyle: v });
          if (remember) patchLastUsed({ text: { fontStyle: v } });
          else void updateSettings("tools", { text: { ...baseText(), fontStyle: v } });
        },
        setTextDecoration: (v) => {
          updateAnnotation(selected.id, { textDecoration: v });
          if (remember) patchLastUsed({ text: { textDecoration: v } });
          else void updateSettings("tools", { text: { ...baseText(), textDecoration: v } });
        },
        setFontFamily: (v) => {
          updateAnnotation(selected.id, { fontFamily: v });
          if (remember) patchLastUsed({ text: { fontFamily: v } });
          else void updateSettings("tools", { text: { ...baseText(), fontFamily: v } });
        },
        setBackgroundColor: (v) => {
          updateAnnotation(selected.id, { backgroundColor: v });
          if (remember) patchLastUsed({ text: { backgroundColor: v } });
          else void updateSettings("tools", { text: { ...baseText(), backgroundColor: v } });
        },
        setBgPadding: (v) => {
          updateAnnotation(selected.id, { bgPadding: v });
          if (remember) patchLastUsed({ text: { backgroundPadding: v } });
          else void updateSettings("tools", { text: { ...baseText(), backgroundPadding: v } });
        },
      };
    } else if (selected.type === "pin") {
      colorCtx = {
        label: "Color",
        value: selected.color,
        onChange: (v) => {
          updateAnnotation(selected.id, { color: v });
          if (remember) patchLastUsed({ pin: { color: v } });
          else void updateSettings("pins", { defaultColor: v });
        },
      };
      sizeCtx = {
        label: "Size",
        value: selected.size,
        min: 12,
        max: 120,
        step: 1,
        onChange: (v) => {
          updateAnnotation(selected.id, { size: v });
          if (remember) patchLastUsed({ pin: { size: v } });
          else void updateSettings("pins", { defaultSize: v });
        },
      };
      pinLabelCtx = {
        label: "Label",
        value: selected.labelColor ?? toolsCfg.pin.labelColor,
        onChange: (v) => {
          updateAnnotation(selected.id, { labelColor: v });
          if (remember) patchLastUsed({ pin: { labelColor: v } });
          else void updateSettings("pins", { defaultLabelColor: v });
        },
      };
      pinBorderCtx = {
        label: "Border",
        value: selected.borderColor ?? toolsCfg.pin.borderColor,
        onChange: (v) => {
          updateAnnotation(selected.id, { borderColor: v });
          if (remember) patchLastUsed({ pin: { borderColor: v } });
          else void updateSettings("pins", { defaultBorderColor: v });
        },
      };
      pinBorderWidthCtx = {
        label: "Border W",
        value: selected.borderWidth ?? toolsCfg.pin.borderWidth,
        min: 0,
        max: 100,
        step: 1,
        onChange: (v) => {
          updateAnnotation(selected.id, { borderWidth: v });
          if (remember) patchLastUsed({ pin: { borderWidth: v } });
          else void updateSettings("pins", { defaultBorderWidth: v });
        },
      };
      pinShapeCtx = {
        value: selected.shape ?? toolsCfg.pin.shape,
        onChange: (v) => {
          updateAnnotation(selected.id, { shape: v });
          if (remember) patchLastUsed({ pin: { shape: v } });
          else void updateSettings("pins", { defaultShape: v });
        },
      };
      pinTailCtx = {
        value: selected.bubbleTail ?? toolsCfg.pin.bubbleTail,
        onChange: (v) => {
          updateAnnotation(selected.id, { bubbleTail: v });
          if (remember) patchLastUsed({ pin: { bubbleTail: v } });
          else void updateSettings("pins", { defaultBubbleTail: v });
        },
      };
    } else if (selected.type === "sticker") {
      sizeCtx = {
        label: "Size",
        value: selected.fontSize,
        min: 12,
        max: 200,
        step: 1,
        onChange: (v) => {
          updateAnnotation(selected.id, { fontSize: v });
          if (remember) patchLastUsed({ sticker: { fontSize: v } });
          else void updateSettings("tools", { sticker: { fontSize: v } });
        },
      };
    } else if (selected.type === "blur") {
      widthCtx = {
        label: "Blur",
        value: selected.blurRadius,
        min: 2,
        max: 60,
        step: 1,
        onChange: (v) => {
          updateAnnotation(selected.id, { blurRadius: v });
          if (remember) patchLastUsed({ blur: { blurRadius: v } });
          else void updateSettings("tools", { blur: { blurRadius: v } });
        },
      };
    }
  } else if (tool === "rect" || tool === "arrow") {
    const slot = tool;
    colorCtx = {
      label: "Stroke",
      value: toolsCfg[slot].strokeColor,
      onChange: (v) => {
        if (remember) patchLastUsed({ [slot]: { strokeColor: v } });
        else void updateSettings("tools", { [slot]: { strokeColor: v } } as Partial<AppConfig["tools"]>);
      },
    };
    widthCtx = {
      label: "Width",
      value: toolsCfg[slot].strokeWidth,
      min: 1,
      max: 20,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ [slot]: { strokeWidth: v } });
        else void updateSettings("tools", { [slot]: { strokeWidth: v } } as Partial<AppConfig["tools"]>);
      },
    };
    if (tool === "rect") {
      rectShapeCtx = {
        value: toolsCfg.rect.shape,
        onChange: (v) => {
          if (remember) patchLastUsed({ rect: { shape: v } });
          else void updateSettings("tools", { rect: { shape: v } } as Partial<AppConfig["tools"]>);
        },
      };
      if (toolsCfg.rect.shape === "rect") {
        cornerCtx = {
          label: "Radius",
          value: toolsCfg.rect.cornerRadius,
          min: 0,
          max: 60,
          step: 1,
          onChange: (v) => {
            if (remember) patchLastUsed({ rect: { cornerRadius: v } });
            else void updateSettings("tools", { rect: { cornerRadius: v } } as Partial<AppConfig["tools"]>);
          },
        };
      }
      // Solid vs. dotted line is chosen via the shape picker (line / dashline),
      // so no separate dash toggle here.
    }
    if (tool === "arrow") {
      arrowHeadsCtx = {
        value: toolsCfg.arrow.heads,
        onChange: (v) => {
          if (remember) patchLastUsed({ arrow: { heads: v } });
          else void updateSettings("tools", { arrow: { heads: v } } as Partial<AppConfig["tools"]>);
        },
      };
      arrowDashCtx = {
        value: toolsCfg.arrow.dash,
        onChange: (v) => {
          if (remember) patchLastUsed({ arrow: { dash: v } });
          else void updateSettings("tools", { arrow: { dash: v } } as Partial<AppConfig["tools"]>);
        },
      };
    }
  } else if (tool === "pen") {
    colorCtx = {
      label: "Stroke",
      value: toolsCfg.pen.strokeColor,
      onChange: (v) => {
        if (remember) patchLastUsed({ pen: { strokeColor: v } });
        else void updateSettings("tools", { pen: { strokeColor: v } } as Partial<AppConfig["tools"]>);
      },
    };
    widthCtx = {
      label: "Width",
      value: toolsCfg.pen.strokeWidth,
      min: 1,
      max: 40,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ pen: { strokeWidth: v } });
        else void updateSettings("tools", { pen: { strokeWidth: v } } as Partial<AppConfig["tools"]>);
      },
    };
    penModeCtx = {
      value: toolsCfg.pen.mode,
      onChange: (v) => {
        if (remember) patchLastUsed({ pen: { mode: v } });
        else void updateSettings("tools", { pen: { mode: v } } as Partial<AppConfig["tools"]>);
      },
    };
    if (toolsCfg.pen.mode === "polygon") {
      penLevelCtx = {
        label: "Straighten",
        value: toolsCfg.pen.polygonEpsilon,
        min: 2,
        max: 40,
        step: 1,
        onChange: (v) => {
          if (remember) patchLastUsed({ pen: { polygonEpsilon: v } });
          else void updateSettings("tools", { pen: { polygonEpsilon: v } } as Partial<AppConfig["tools"]>);
        },
      };
    } else if (toolsCfg.pen.mode === "curve") {
      penLevelCtx = {
        label: "Curve",
        value: toolsCfg.pen.curveSmoothing,
        min: 0,
        max: 30,
        step: 1,
        onChange: (v) => {
          if (remember) patchLastUsed({ pen: { curveSmoothing: v } });
          else void updateSettings("tools", { pen: { curveSmoothing: v } } as Partial<AppConfig["tools"]>);
        },
      };
    }
  } else if (tool === "highlighter") {
    colorCtx = {
      label: "Color",
      value: toolsCfg.highlighter.strokeColor,
      onChange: (v) => {
        if (remember) patchLastUsed({ highlighter: { strokeColor: v } });
        else void updateSettings("tools", { highlighter: { strokeColor: v } } as Partial<AppConfig["tools"]>);
      },
    };
    widthCtx = {
      label: "Width",
      value: toolsCfg.highlighter.strokeWidth,
      min: 4,
      max: 100,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ highlighter: { strokeWidth: v } });
        else void updateSettings("tools", { highlighter: { strokeWidth: v } } as Partial<AppConfig["tools"]>);
      },
    };
    sizeCtx = {
      label: "Opacity",
      value: Math.round(toolsCfg.highlighter.opacity * 100),
      min: 10,
      max: 100,
      step: 5,
      onChange: (v) => {
        if (remember) patchLastUsed({ highlighter: { opacity: v / 100 } });
        else void updateSettings("tools", { highlighter: { opacity: v / 100 } } as Partial<AppConfig["tools"]>);
      },
    };
  } else if (tool === "magnify") {
    colorCtx = {
      label: "Border",
      value: toolsCfg.magnify.strokeColor,
      onChange: (v) => {
        if (remember) patchLastUsed({ magnify: { strokeColor: v } });
        else void updateSettings("tools", { magnify: { strokeColor: v } } as Partial<AppConfig["tools"]>);
      },
    };
    magnifyShapeCtx = {
      value: toolsCfg.magnify.shape,
      onChange: (v) => {
        if (remember) patchLastUsed({ magnify: { shape: v } });
        else void updateSettings("tools", { magnify: { shape: v } } as Partial<AppConfig["tools"]>);
      },
    };
    sizeCtx = {
      label: "Zoom",
      value: toolsCfg.magnify.zoom,
      min: 2,
      max: 8,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ magnify: { zoom: v } });
        else void updateSettings("tools", { magnify: { zoom: v } } as Partial<AppConfig["tools"]>);
      },
    };
    widthCtx = {
      label: "Area",
      value: Math.round(toolsCfg.magnify.areaOpacity * 100),
      min: 0,
      max: 100,
      step: 5,
      onChange: (v) => {
        if (remember) patchLastUsed({ magnify: { areaOpacity: v / 100 } });
        else void updateSettings("tools", { magnify: { areaOpacity: v / 100 } } as Partial<AppConfig["tools"]>);
      },
    };
    const mLinked = toolsCfg.magnify.borderLinked;
    cornerCtx = {
      label: mLinked ? "Border" : "Out",
      value: toolsCfg.magnify.strokeWidth,
      min: 1,
      max: 20,
      step: 1,
      onChange: (v) => {
        const patch = mLinked
          ? { strokeWidth: v, sourceStrokeWidth: srcFromOut(v) }
          : { strokeWidth: v };
        if (remember) patchLastUsed({ magnify: patch });
        else void updateSettings("tools", { magnify: patch } as Partial<AppConfig["tools"]>);
      },
    };
    if (!mLinked) {
      penLevelCtx = {
        label: "Src",
        value: toolsCfg.magnify.sourceStrokeWidth,
        min: 1,
        max: 20,
        step: 1,
        onChange: (v) => {
          if (remember) patchLastUsed({ magnify: { sourceStrokeWidth: v } });
          else void updateSettings("tools", { magnify: { sourceStrokeWidth: v } } as Partial<AppConfig["tools"]>);
        },
      };
    }
    magnifyLinkCtx = {
      value: mLinked,
      onChange: (next) => {
        const patch = next
          ? { borderLinked: true, sourceStrokeWidth: srcFromOut(toolsCfg.magnify.strokeWidth) }
          : { borderLinked: false };
        if (remember) patchLastUsed({ magnify: patch });
        else void updateSettings("tools", { magnify: patch } as Partial<AppConfig["tools"]>);
      },
    };
    arrowDashCtx = {
      value: toolsCfg.magnify.linkDash,
      onChange: (v) => {
        if (remember) patchLastUsed({ magnify: { linkDash: v } });
        else void updateSettings("tools", { magnify: { linkDash: v } } as Partial<AppConfig["tools"]>);
      },
    };
  } else if (tool === "text") {
    const baseText = () => ({
      fontSize: toolsCfg.text.fontSize,
      color: toolsCfg.text.color,
      fontStyle: toolsCfg.text.fontStyle,
      textDecoration: toolsCfg.text.textDecoration,
      fontFamily: toolsCfg.text.fontFamily,
      backgroundColor: toolsCfg.text.backgroundColor,
      backgroundPadding: toolsCfg.text.backgroundPadding,
    });
    colorCtx = {
      label: "Color",
      value: toolsCfg.text.color,
      onChange: (v) => {
        if (remember) patchLastUsed({ text: { color: v } });
        else void updateSettings("tools", { text: { ...baseText(), color: v } });
      },
    };
    sizeCtx = {
      label: "Size",
      value: toolsCfg.text.fontSize,
      min: 8,
      max: 96,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ text: { fontSize: v } });
        else void updateSettings("tools", { text: { ...baseText(), fontSize: v } });
      },
    };
    textStyleCtx = {
      fontStyle: toolsCfg.text.fontStyle,
      textDecoration: toolsCfg.text.textDecoration,
      fontFamily: toolsCfg.text.fontFamily,
      backgroundColor: toolsCfg.text.backgroundColor,
      bgPadding: toolsCfg.text.backgroundPadding,
      setFontStyle: (v) => {
        if (remember) patchLastUsed({ text: { fontStyle: v } });
        else void updateSettings("tools", { text: { ...baseText(), fontStyle: v } });
      },
      setTextDecoration: (v) => {
        if (remember) patchLastUsed({ text: { textDecoration: v } });
        else void updateSettings("tools", { text: { ...baseText(), textDecoration: v } });
      },
      setFontFamily: (v) => {
        if (remember) patchLastUsed({ text: { fontFamily: v } });
        else void updateSettings("tools", { text: { ...baseText(), fontFamily: v } });
      },
      setBackgroundColor: (v) => {
        if (remember) patchLastUsed({ text: { backgroundColor: v } });
        else void updateSettings("tools", { text: { ...baseText(), backgroundColor: v } });
      },
      setBgPadding: (v) => {
        if (remember) patchLastUsed({ text: { backgroundPadding: v } });
        else void updateSettings("tools", { text: { ...baseText(), backgroundPadding: v } });
      },
    };
  } else if (tool === "pin") {
    colorCtx = {
      label: "Color",
      value: toolsCfg.pin.color,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { color: v } });
        else void updateSettings("pins", { defaultColor: v });
      },
    };
    sizeCtx = {
      label: "Size",
      value: toolsCfg.pin.size,
      min: 12,
      max: 120,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { size: v } });
        else void updateSettings("pins", { defaultSize: v });
      },
    };
    pinLabelCtx = {
      label: "Label",
      value: toolsCfg.pin.labelColor,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { labelColor: v } });
        else void updateSettings("pins", { defaultLabelColor: v });
      },
    };
    pinBorderCtx = {
      label: "Border",
      value: toolsCfg.pin.borderColor,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { borderColor: v } });
        else void updateSettings("pins", { defaultBorderColor: v });
      },
    };
    pinBorderWidthCtx = {
      label: "Border W",
      value: toolsCfg.pin.borderWidth,
      min: 0,
      max: 100,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { borderWidth: v } });
        else void updateSettings("pins", { defaultBorderWidth: v });
      },
    };
    pinShapeCtx = {
      value: toolsCfg.pin.shape,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { shape: v } });
        else void updateSettings("pins", { defaultShape: v });
      },
    };
    pinTailCtx = {
      value: toolsCfg.pin.bubbleTail,
      onChange: (v) => {
        if (remember) patchLastUsed({ pin: { bubbleTail: v } });
        else void updateSettings("pins", { defaultBubbleTail: v });
      },
    };
  } else if (tool === "sticker") {
    sizeCtx = {
      label: "Size",
      value: toolsCfg.sticker.fontSize,
      min: 12,
      max: 200,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ sticker: { fontSize: v } });
        else void updateSettings("tools", { sticker: { fontSize: v } });
      },
    };
  } else if (tool === "blur") {
    widthCtx = {
      label: "Blur",
      value: toolsCfg.blur.blurRadius,
      min: 2,
      max: 60,
      step: 1,
      onChange: (v) => {
        if (remember) patchLastUsed({ blur: { blurRadius: v } });
        else void updateSettings("tools", { blur: { blurRadius: v } });
      },
    };
  }

  const canvasMaxPin = annotations.reduce(
    (m, a) => (a.type === "pin" ? Math.max(m, a.number) : m),
    0,
  );

  const notify = (msg: string) => toast(msg);

  const clearPersisted = () => {
    const start = pinsCfg.defaultStartNumber;
    void updateSettings("pins", {
      lastUsedNumber: start - 1,
      continuityMode: "reset",
    });
    setNextPinNumber(start);
    notify(`Cleared. Next capture starts at ${start}`);
  };
  const savePersisted = () => {
    const lastUsed = Math.max(0, nextPinNumber - 1);
    void updateSettings("pins", { lastUsedNumber: lastUsed });
    notify(`Saved. Latest = ${lastUsed}`);
  };
  const toggleContinuity = () => {
    const mode = pinsCfg.continuityMode === "continue" ? "reset" : "continue";
    if (mode === "continue") {
      const lastUsed = Math.max(canvasMaxPin, pinsCfg.lastUsedNumber, nextPinNumber - 1, 0);
      void updateSettings("pins", { continuityMode: mode, lastUsedNumber: lastUsed });
      setNextPinNumber(Math.max(lastUsed + 1, pinsCfg.defaultStartNumber));
      notify(`Continue on. Latest = ${lastUsed}`);
    } else {
      void updateSettings("pins", { continuityMode: mode });
      setNextPinNumber(pinsCfg.defaultStartNumber);
      notify("Continue off");
    }
  };
  const onChangeNext = (v: number) => {
    setNextPinNumber(v);
    notify(`Next = ${v}`);
  };

  const widthRef = useRef<NumCtx | null>(null);
  const sizeRef = useRef<NumCtx | null>(null);
  widthRef.current = widthCtx;
  sizeRef.current = sizeCtx;

  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    }
    function clamp(c: NumCtx, v: number) {
      return Math.min(c.max, Math.max(c.min, v));
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "[" || k === "]") {
        const c = widthRef.current;
        if (!c) return;
        e.preventDefault();
        c.onChange(clamp(c, c.value + (k === "]" ? 1 : -1)));
      } else if (k === "-" || k === "+" || k === "=") {
        const c = sizeRef.current;
        if (!c) return;
        e.preventDefault();
        c.onChange(clamp(c, c.value + (k === "-" ? -2 : 2)));
      } else if (k === "c" || k === "C") {
        const r = colorInputRef.current;
        if (!r) return;
        e.preventDefault();
        r.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doExport = async (action: ExportAction) => {
    const stage = getStage();
    if (!stage || exporting) return;
    setExporting(true);
    // WYSIWYG: commit pending text edit + clear selection so transformer UI
    // doesn't get baked into the exported PNG.
    runPrepareExport();
    try {
      const r =
        action === "copy"
          ? await copyOnly(stage)
          : action === "file"
            ? await saveOnly(stage, fullConfig)
            : await saveAndCopy(stage, fullConfig);
      if (r.saved && r.copied) notify("Saved & Copied");
      else if (r.saved) notify("Saved");
      else if (r.copied) notify("Copied");
      else if (r.downloaded)
        toast("Downloaded instead", {
          description:
            "This browser can't copy images to the clipboard — saved the PNG to your downloads.",
        });
    } catch (e) {
      console.error("export failed", e);
      const { title, detail } = describeExportError(e);
      const recoverable =
        title === "Permission denied" ||
        title === "Read-only volume" ||
        title === "Disk full";
      toast.error(title, {
        description: detail,
        action: recoverable
          ? {
              label: "Pick folder",
              onClick: () => {
                onOpenSettings?.();
                void (async () => {
                  const { emit } = await import("@tauri-apps/api/event");
                  await emit("settings:focus-tab", "output");
                })();
              },
            }
          : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  const lastCaptureKind: CaptureKind =
    fullConfig.lastUsed?.lastCaptureKind ?? "full";

  // Output split button: default primary is Copy (the most common single action
  // for a screenshot), then remembers whatever was last used.
  const lastExportAction: ExportAction =
    fullConfig.lastUsed?.lastExportAction ?? "copy";

  const runExport = (action: ExportAction) => {
    patchLastUsed({ lastExportAction: action });
    void doExport(action);
  };

  const triggerCapture = (kind: CaptureKind) => {
    patchLastUsed({ lastCaptureKind: kind });
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("trigger_capture_command", { kind });
      } catch (err) {
        console.error("trigger_capture_command failed", err);
        toast.error("Capture failed", { description: String(err) });
      }
    })();
  };

  const captureAccelerators: Record<CaptureKind, string> = {
    full: fullConfig.hotkeys.captureFull,
    area: fullConfig.hotkeys.captureArea,
    window: fullConfig.hotkeys.captureWindow,
  };

  const onClearWorkspace = () => {
    void (async () => {
      try {
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const ok = await ask(
          "Drop the current image and all annotations? This cannot be undone.",
          { title: "Clear workspace?", kind: "warning", okLabel: "Clear", cancelLabel: "Cancel" },
        );
        if (!ok) return;
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("clear_editor_workspace");
        toast("Workspace cleared");
      } catch (err) {
        console.error("clear_editor_workspace failed", err);
        toast.error("Clear failed", { description: String(err) });
      }
    })();
  };

  // Import an image file from disk. On an empty canvas it becomes the base
  // image; on a non-empty canvas it lands as a layered overlay object (the
  // decision lives in importImagePathDesktop / the /paste router). Desktop opens
  // a native file dialog; web dispatches to the /paste page's hidden file input.
  const importImageFile = () => {
    void (async () => {
      if (!isTauriRuntime()) {
        window.dispatchEvent(new CustomEvent("capz:web-import"));
        return;
      }
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({
          multiple: false,
          directory: false,
          filters: [
            { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
          ],
        });
        if (typeof picked !== "string") return; // cancelled
        const { importImagePathDesktop } = await import("@/lib/importImage");
        const ok = await importImagePathDesktop(picked);
        if (!ok) toast.error("Couldn't import image");
      } catch (err) {
        console.error("import image failed", err);
        toast.error("Import failed", { description: String(err) });
      }
    })();
  };

  // Tool palette overflow zone
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const activeToolIndex = TOOLS.findIndex((t) => t.id === tool);
  const { visible: visibleTools, overflow: overflowTools } = useOverflowSlots(
    TOOLS,
    paletteRef,
    // Reserve headroom for the up-to-4 cluster dividers so they don't push the
    // last tool past the palette edge (the slot math counts tools, not dividers).
    48,
    36,
    activeToolIndex >= 0 ? activeToolIndex : undefined,
  );
  const overflowItems: OverflowItem[] = useMemo(
    () =>
      overflowTools.map((t) => ({
        key: t.id,
        label: t.label,
        icon: t.icon,
        hint: t.hint,
        active: tool === t.id,
        onSelect: () => setTool(t.id),
      })),
    [overflowTools, tool, setTool],
  );

  const hasContext = !!(
    colorCtx ||
    widthCtx ||
    sizeCtx ||
    textStyleCtx ||
    pinLabelCtx ||
    // Any selected annotation gets the option bar so the reorder (z-order)
    // controls are always available — even for types with no other options
    // (e.g. a layered image).
    selected ||
    tool === "pin" ||
    tool === "sticker"
  );

  const Divider = () => <div className="mx-1 h-5 w-px bg-[var(--border-strong)]" />;

  // Stacking-order (z-index) controls, shown for any selected annotation. The
  // base screenshot is always behind every annotation and is not reorderable.
  const selIndex = selected
    ? annotations.findIndex((a) => a.id === selected.id)
    : -1;
  const atFront = selIndex >= 0 && selIndex === annotations.length - 1;
  const atBack = selIndex === 0;
  const reorderBtn = (
    Icon: LucideIcon,
    title: string,
    mode: "front" | "back" | "forward" | "backward",
    disabled: boolean,
  ) => (
    <button
      type="button"
      onClick={() => selected && reorderAnnotation(selected.id, mode)}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={[
        "flex h-7 w-7 items-center justify-center rounded transition-colors",
        disabled
          ? "text-[var(--fg-2)] opacity-40"
          : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );

  return (
    <div className="relative z-20 flex flex-col border-b border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-1.5">
      <div className="flex items-center gap-1">
        {/* Output group */}
        <div className="flex items-center gap-1">
          <ExportSplitButton
            lastAction={lastExportAction}
            onExport={runExport}
            disabled={exporting}
          />
        </div>
        <Divider />
        {/* Capture split (desktop only — browsers cannot trigger captures) */}
        {tauriUi && (
          <>
            <CaptureSplitButton
              lastKind={lastCaptureKind}
              onCapture={triggerCapture}
              onScrollCapture={() => {
                void (async () => {
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("trigger_capture_command", { kind: "scroll" });
                  } catch (err) {
                    console.error("trigger_capture_command(scroll) failed", err);
                    toast.error("Scrolling capture failed", { description: String(err) });
                  }
                })();
              }}
              accelerators={captureAccelerators}
            />
            <Divider />
          </>
        )}
        {/* Web build: in-browser capture (getDisplayMedia) — capture again
            without leaving the editor. */}
        {!tauriUi && onWebCapture && (
          <>
            <ToolButton icon={Monitor} label="Capture screen" onClick={onWebCapture} />
            <Divider />
          </>
        )}
        {/* History group */}
        <ToolButton icon={Undo2} label="Undo" hint="⌘Z" disabled={!past} onClick={undo} />
        <ToolButton icon={Redo2} label="Redo" hint="⇧⌘Z" disabled={!future} onClick={redo} />
        {tauriUi && (
          <ToolButton
            icon={Trash2}
            label={hasImage ? "Clear workspace" : "Workspace already empty"}
            disabled={!hasImage}
            onClick={onClearWorkspace}
          />
        )}
        {!tauriUi && onWebClear && (
          <ToolButton
            icon={Trash2}
            label={hasImage ? "Delete image" : "No image loaded"}
            disabled={!hasImage}
            onClick={onWebClear}
          />
        )}
        <Divider />
        {/* View group */}
        <ZoomMenuButton displayScale={displayScale} disabled={!hasImage} />
        <Divider />
        {/* Ruler toggle */}
        <ToolButton
          icon={Ruler}
          label={fullConfig.general.showRulers ? "Hide rulers" : "Show rulers"}
          pressed={fullConfig.general.showRulers}
          onClick={() =>
            void updateSettings("general", {
              showRulers: !fullConfig.general.showRulers,
            })
          }
        />
        <Divider />
        {/* Import an image file (native picker on desktop, file input on web).
            First image on an empty canvas becomes the base; a further image
            lands as a movable overlay on top. Enabled even with no base image
            so it can load the first one. */}
        <ToolButton
          icon={ImageDown}
          label={
            hasImage
              ? "Add image file as overlay"
              : "Open image file"
          }
          onClick={importImageFile}
        />
        <Divider />
        {/* Padded gradient/solid backdrop behind the capture. Divider travels
            with the control so an imageless toolbar doesn't show a double rule. */}
        {hasImage && (
          <>
            <BackdropControl />
            <Divider />
          </>
        )}
        {/* OCR detect-text toggle (desktop only — OCR runs in the Rust core) */}
        {tauriUi && (
          <>
            <ToolButton
              icon={ocrStatus === "scanning" ? Loader2 : ScanText}
              iconClassName={ocrStatus === "scanning" ? "animate-spin" : undefined}
              label={
                !hasImage
                  ? "Detect text (load an image first)"
                  : ocrStatus === "scanning"
                    ? "Detecting text…"
                    : ocrMode
                      ? "Hide detected text"
                      : "Detect text"
              }
              pressed={ocrMode}
              disabled={!hasImage || ocrStatus === "scanning"}
              onClick={() => void toggleOcr()}
            />
            <Divider />
          </>
        )}
        {/* Tool palette with responsive overflow */}
        <div ref={paletteRef} className="flex min-w-0 flex-1 items-center gap-1">
          {visibleTools.map((t, i) => {
            // Divider whenever the cluster changes between two visible tools —
            // reads as an intentional group boundary, and only appears between
            // tools that actually survived the overflow cut.
            const startsCluster = i > 0 && visibleTools[i - 1].group !== t.group;
            return (
              <Fragment key={t.id}>
                {startsCluster && <Divider />}
                <ToolButton
                  icon={t.icon}
                  label={t.label}
                  hint={t.hint}
                  active={tool === t.id}
                  onClick={() => setTool(t.id)}
                />
              </Fragment>
            );
          })}
          <OverflowMenu items={overflowItems} />
        </div>
        {/* Settings — far right (desktop only) */}
        {tauriUi && (
          <ToolButton
            icon={SettingsIcon}
            label="Settings"
            onClick={() => onOpenSettings?.()}
          />
        )}
      </div>
      {hasContext && portalTarget && createPortal((
      <div className="toolbar pointer-events-auto absolute left-1/2 -translate-x-1/2 top-7 z-40 flex flex-wrap items-center justify-center gap-1 px-3 py-1.5">
      {colorCtx && (
        <>
          <label
            className="flex items-center gap-1.5 text-xs text-foreground/80"
            title={selected ? "Edit selected element color" : "Default color for next element"}
          >
            {colorCtx.label}
            <input
              ref={colorInputRef}
              type="color"
              value={colorCtx.value}
              onChange={(e) => colorCtx!.onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
            />
          </label>
        </>
      )}
      {pinLabelCtx && (
        <label
          className="flex items-center gap-1.5 text-xs text-foreground/80"
          title="Pin number color"
        >
          {pinLabelCtx.label}
          <input
            type="color"
            value={pinLabelCtx.value}
            onChange={(e) => pinLabelCtx!.onChange(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
          />
        </label>
      )}
      {pinBorderCtx && (
        <label
          className="flex items-center gap-1.5 text-xs text-foreground/80"
          title="Pin border color"
        >
          {pinBorderCtx.label}
          <input
            type="color"
            value={pinBorderCtx.value}
            onChange={(e) => pinBorderCtx!.onChange(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
          />
        </label>
      )}
      {pinBorderWidthCtx && (
        <label
          className="flex items-center gap-1.5 text-xs text-foreground/80"
          title={pinBorderWidthCtx.label}
        >
          {pinBorderWidthCtx.label}
          <input
            type="range"
            min={pinBorderWidthCtx.min}
            max={pinBorderWidthCtx.max}
            step={pinBorderWidthCtx.step}
            value={Math.round(pinBorderWidthCtx.value)}
            onChange={(e) =>
              pinBorderWidthCtx!.onChange(parseInt(e.target.value, 10))
            }
            className="h-1 w-20 cursor-pointer accent-[var(--accent)]"
          />
          <span className="w-5 text-right tabular-nums">
            {Math.round(pinBorderWidthCtx.value)}
          </span>
        </label>
      )}
      {pinShapeCtx && (() => {
        const psc = pinShapeCtx;
        const shapeBtn = (
          v: PinShapeKind,
          title: string,
          Icon: LucideIcon,
        ) => (
          <button
            type="button"
            onClick={() => psc.onChange(v)}
            title={title}
            aria-pressed={psc.value === v}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              psc.value === v
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
        return (
          <div
            className="flex items-center gap-0.5"
            title="Pin shape"
          >
            {shapeBtn("circle", "Circle", CircleIcon)}
            {shapeBtn("bubble", "Message bubble", MessageCircle)}
            {shapeBtn("mappin", "Map pin", MapPin)}
          </div>
        );
      })()}
      {pinTailCtx && pinShapeCtx?.value === "bubble" && (() => {
        const ptc = pinTailCtx;
        const tailBtn = (
          v: PinTailDir,
          title: string,
          Icon: LucideIcon,
        ) => (
          <button
            type="button"
            onClick={() => ptc.onChange(v)}
            title={title}
            aria-pressed={ptc.value === v}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              ptc.value === v
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
        return (
          <div className="flex items-center gap-0.5" title="Tail direction">
            {tailBtn("up", "Tail up", ArrowUp)}
            {tailBtn("down", "Tail down", ArrowDown)}
            {tailBtn("left", "Tail left", ArrowLeft)}
            {tailBtn("right", "Tail right", ArrowRight)}
          </div>
        );
      })()}
      {rectShapeCtx && (() => {
        const rsc = rectShapeCtx;
        const shapeBtn = (
          v: RectShapeKind,
          title: string,
          Icon: ComponentType<{ className?: string }>,
        ) => (
          <button
            type="button"
            onClick={() => rsc.onChange(v)}
            title={title}
            aria-pressed={rsc.value === v}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              rsc.value === v
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
        return (
          <div className="flex items-center gap-0.5" title="Shape">
            {shapeBtn("rect", "Rectangle", Square)}
            {shapeBtn("ellipse", "Circle", CircleIcon)}
            {shapeBtn("line", "Line", Minus)}
            {shapeBtn("dashline", "Dashed line", DashLineIcon)}
          </div>
        );
      })()}
      {penModeCtx && (() => {
        const pmc = penModeCtx;
        const modeBtn = (v: FreehandMode, title: string, Icon: LucideIcon) => (
          <button
            type="button"
            onClick={() => pmc.onChange(v)}
            title={title}
            aria-pressed={pmc.value === v}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              pmc.value === v
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
        return (
          <div className="flex items-center gap-0.5" title="Smoothing">
            {modeBtn("raw", "Raw", PenLine)}
            {modeBtn("polygon", "Polygon", Waypoints)}
            {modeBtn("curve", "Curve", Spline)}
          </div>
        );
      })()}
      {magnifyShapeCtx && (() => {
        const msc = magnifyShapeCtx;
        const shapeBtn = (v: MagnifyShape, title: string, Icon: LucideIcon) => (
          <button
            type="button"
            onClick={() => msc.onChange(v)}
            title={title}
            aria-pressed={msc.value === v}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              msc.value === v
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
        return (
          <div className="flex items-center gap-0.5" title="Loupe shape">
            {shapeBtn("circle", "Circle", CircleIcon)}
            {shapeBtn("rect", "Rectangle", Square)}
          </div>
        );
      })()}
      {arrowHeadsCtx && (() => {
        const ahc = arrowHeadsCtx;
        const twoWay = ahc.value === "both";
        return (
          <button
            type="button"
            onClick={() => ahc.onChange(twoWay ? "end" : "both")}
            title="Two-way arrowhead"
            aria-pressed={twoWay}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              twoWay
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })()}
      {arrowDashCtx && (() => {
        const adc = arrowDashCtx;
        return (
          <button
            type="button"
            onClick={() => adc.onChange(!adc.value)}
            title="Dashed line"
            aria-pressed={adc.value}
            aria-label="Dashed line"
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              adc.value
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <DashLineIcon className="h-3.5 w-3.5" />
          </button>
        );
      })()}
      {widthCtx && (
        <>
          <label
            className="flex items-center gap-1.5 text-xs text-foreground/80"
            title={`${widthCtx.label}: [/]`}
          >
            {widthCtx.label}
            <input
              type="range"
              min={widthCtx.min}
              max={widthCtx.max}
              step={widthCtx.step}
              value={Math.round(widthCtx.value)}
              onChange={(e) => widthCtx!.onChange(parseInt(e.target.value, 10))}
              className="h-1 w-24 cursor-pointer accent-[var(--accent)]"
            />
            <span className="w-6 text-right tabular-nums">{Math.round(widthCtx.value)}</span>
          </label>
        </>
      )}
      {cornerCtx && (
        <label
          className="flex items-center gap-1.5 text-xs text-foreground/80"
          title={cornerCtx.label}
        >
          {cornerCtx.label}
          <input
            type="range"
            min={cornerCtx.min}
            max={cornerCtx.max}
            step={cornerCtx.step}
            value={Math.round(cornerCtx.value)}
            onChange={(e) => cornerCtx!.onChange(parseInt(e.target.value, 10))}
            className="h-1 w-24 cursor-pointer accent-[var(--accent)]"
          />
          <span className="w-6 text-right tabular-nums">{Math.round(cornerCtx.value)}</span>
        </label>
      )}
      {penLevelCtx && (
        <label
          className="flex items-center gap-1.5 text-xs text-foreground/80"
          title={penLevelCtx.label}
        >
          {penLevelCtx.label}
          <input
            type="range"
            min={penLevelCtx.min}
            max={penLevelCtx.max}
            step={penLevelCtx.step}
            value={Math.round(penLevelCtx.value)}
            onChange={(e) => penLevelCtx!.onChange(parseInt(e.target.value, 10))}
            className="h-1 w-24 cursor-pointer accent-[var(--accent)]"
          />
          <span className="w-7 text-right tabular-nums">{Math.round(penLevelCtx.value)}</span>
        </label>
      )}
      {magnifyLinkCtx && (() => {
        const mlc = magnifyLinkCtx;
        return (
          <button
            type="button"
            onClick={() => mlc.onChange(!mlc.value)}
            title={mlc.value ? "Borders linked — click to set separately" : "Borders separate — click to link"}
            aria-pressed={mlc.value}
            aria-label="Link border widths"
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              mlc.value
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            {mlc.value ? (
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Link2Off className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        );
      })()}
      {sizeCtx && (
        <>
          <label
            className="flex items-center gap-1.5 text-xs text-foreground/80"
            title={`${sizeCtx.label}: -/+`}
          >
            {sizeCtx.label}
            <input
              type="range"
              min={sizeCtx.min}
              max={sizeCtx.max}
              step={sizeCtx.step}
              value={Math.round(sizeCtx.value)}
              onChange={(e) => sizeCtx!.onChange(parseInt(e.target.value, 10))}
              className="h-1 w-24 cursor-pointer accent-[var(--accent)]"
            />
            <span className="w-8 text-right tabular-nums">{Math.round(sizeCtx.value)}</span>
          </label>
        </>
      )}
      {textStyleCtx && (() => {
        const tsc = textStyleCtx;
        const bold = tsc.fontStyle.includes("bold");
        const italic = tsc.fontStyle.includes("italic");
        const ul = tsc.textDecoration.includes("underline");
        const st = tsc.textDecoration.includes("line-through");
        const togBtn = (
          active: boolean,
          onClick: () => void,
          title: string,
          Icon: LucideIcon,
        ) => (
          <button
            type="button"
            onClick={onClick}
            title={title}
            aria-pressed={active}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              active
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
        return (
          <>
            <div className="flex items-center gap-0.5">
              {togBtn(bold, () => tsc.setFontStyle(withBold(tsc.fontStyle, !bold)), "Bold", Bold)}
              {togBtn(italic, () => tsc.setFontStyle(withItalic(tsc.fontStyle, !italic)), "Italic", Italic)}
              {togBtn(ul, () => tsc.setTextDecoration(withDeco(tsc.textDecoration, "underline", !ul)), "Underline", Underline)}
              {togBtn(st, () => tsc.setTextDecoration(withDeco(tsc.textDecoration, "line-through", !st)), "Strike", Strikethrough)}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-foreground/80" title="Font family">
              Font
              <select
                value={tsc.fontFamily}
                onChange={(e) => tsc.setFontFamily(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-[var(--accent)]"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1.5 text-xs text-foreground/80">
              <button
                type="button"
                onClick={() =>
                  tsc.setBackgroundColor(
                    tsc.backgroundColor === null ? lastBgColor : null,
                  )
                }
                aria-pressed={tsc.backgroundColor !== null}
                title="Text background on/off"
                className={[
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  tsc.backgroundColor !== null
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "text-[var(--fg-2)] hover:bg-[var(--surface-raised)]",
                ].join(" ")}
              >
                Bg
              </button>
              {tsc.backgroundColor !== null && (
                <>
                  <input
                    type="color"
                    value={tsc.backgroundColor}
                    title="Background color"
                    onChange={(e) => {
                      setLastBgColor(e.target.value);
                      tsc.setBackgroundColor(e.target.value);
                    }}
                    className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-white/[0.06] p-0.5"
                  />
                  <label className="flex items-center gap-1" title="Background padding">
                    Pad
                    <input
                      type="range"
                      min={0}
                      max={48}
                      step={1}
                      value={Math.round(tsc.bgPadding)}
                      onChange={(e) => tsc.setBgPadding(parseInt(e.target.value, 10))}
                      className="h-1 w-20 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="w-5 text-right tabular-nums">
                      {Math.round(tsc.bgPadding)}
                    </span>
                  </label>
                </>
              )}
            </div>
          </>
        );
      })()}
      {tool === "pin" && (
        <>
          <div className="flex items-center gap-2 text-xs text-foreground/80">
            <label className="flex items-center gap-1">
              Next:
              <input
                type="number"
                min={0}
                value={nextPinNumber}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v >= 0) onChangeNext(v);
                }}
                className="w-14 rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-center text-xs text-foreground outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={savePersisted}
              title="Persist current as latest used number"
              className="rounded-md px-2 py-1 text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={clearPersisted}
              title={`Clear persisted (reset to ${pinsCfg.defaultStartNumber - 1})`}
              className="rounded-md px-2 py-1 text-foreground/85 transition-colors hover:bg-[var(--surface-raised)] hover:text-foreground"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={toggleContinuity}
              title="Toggle continuity across captures"
              className={[
                "rounded-md px-2 py-1 transition-colors",
                pinsCfg.continuityMode === "continue"
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-foreground/85 hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              Continue
            </button>
          </div>
        </>
      )}
      {tool === "sticker" && (
        <>
          <div className="flex flex-wrap items-center gap-0.5">
            {stickerEntries.length > 0
              ? stickerEntries.map((e) => {
                  const active =
                    stickerSelection.kind === "image" &&
                    stickerSelection.src === e.dataUrl;
                  return (
                    <button
                      key={e.name}
                      type="button"
                      onClick={() =>
                        setStickerSelection({
                          kind: "image",
                          src: e.dataUrl,
                          name: e.name,
                        })
                      }
                      title={e.name}
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded p-0.5 transition-colors",
                        active
                          ? "bg-[var(--accent)]"
                          : "hover:bg-[var(--surface-raised)]",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.dataUrl}
                        alt={e.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                  );
                })
              : STICKERS.map((c) => {
                  const active =
                    stickerSelection.kind === "emoji" &&
                    stickerSelection.char === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setStickerSelection({ kind: "emoji", char: c })
                      }
                      title={c}
                      className={[
                        "rounded px-1.5 py-0.5 text-base leading-none transition-colors",
                        active
                          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                          : "hover:bg-[var(--surface-raised)]",
                      ].join(" ")}
                    >
                      {c}
                    </button>
                  );
                })}
          </div>
        </>
      )}
      {selected && (
        <>
          <div className="mx-1 h-5 w-px bg-[var(--border-strong)]" />
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label="Stacking order"
          >
            {reorderBtn(SendToBack, "Send to back", "back", atBack)}
            {reorderBtn(ChevronsDown, "Send backward", "backward", atBack)}
            {reorderBtn(ChevronsUp, "Bring forward", "forward", atFront)}
            {reorderBtn(BringToFront, "Bring to front", "front", atFront)}
          </div>
        </>
      )}
      </div>
      ), portalTarget)}
    </div>
  );
}
