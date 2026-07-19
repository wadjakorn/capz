"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  MousePointer2,
  ArrowUpRight,
  Type,
  Droplet,
  Smile,
  Crop,
  Pencil,
  Highlighter,
  Search,
  Shapes as ShapesIcon,
  Undo2,
  Redo2,
  Trash2,
  Settings as SettingsIcon,
  Ruler,
  ScanText,
  Loader2,
  Monitor,
  ImageDown,
  type LucideIcon,
} from "lucide-react";
import { formatShortcut, currentPlatform } from "@/lib/shortcuts";
import {
  useEditor,
  STICKERS,
  type Tool,
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
import { ToolOptionsPanel } from "./toolbar/panels/ToolOptionsPanel";
import type {
  ColorCtx,
  NumCtx,
  ToggleCtx,
  TextStyleCtx,
  TextFontStyle,
  TextDecoration,
  PinShapeCtx,
  PinTailCtx,
  RectShapeCtx,
  PenModeCtx,
  MagnifyShapeCtx,
  ArrowHeadsCtx,
} from "./toolbar/panels/types";
import { isTauriRuntime } from "@/lib/platform";

// macOS-only: the system area capture mode delegates to `screencapture -i`,
// which exists only on macOS. `currentPlatform` is prerender-safe (navigator is
// absent during static export) and handles the deprecated `navigator.platform`.
const IS_MAC = currentPlatform() === "mac";

type ToolDef = { id: Tool; label: string; hint: string; icon: LucideIcon };

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", hint: "V", icon: MousePointer2 },
  { id: "arrow", label: "Arrow", hint: "A", icon: ArrowUpRight },
  { id: "rect", label: "Shapes", hint: "R", icon: ShapesIcon },
  { id: "text", label: "Text", hint: "T", icon: Type },
  { id: "blur", label: "Blur", hint: "B", icon: Droplet },
  { id: "pen", label: "Pen", hint: "D", icon: Pencil },
  { id: "highlighter", label: "Highlighter", hint: "H", icon: Highlighter },
  { id: "magnify", label: "Magnify", hint: "M", icon: Search },
  { id: "sticker", label: "Sticker", hint: "S", icon: Smile },
  { id: "pin", label: "Pin", hint: "P", icon: NumberedPinIcon as LucideIcon },
  { id: "crop", label: "Crop", hint: "C", icon: Crop },
];

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
        // Shape is add-only: it decides the annotation's *type* at draw time
        // (line/dashline draw a 2-point segment, rect/ellipse draw a box — see
        // EditorStage's pointer-down), so it cannot be re-picked afterwards.
        // Switching it on an existing shape either did nothing (rect → line) or
        // silently squared off an ellipse, so the picker is hidden while a
        // shape is selected — pick the shape before drawing the next one.
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
        align: toolsCfg.text.align,
        lineHeight: toolsCfg.text.lineHeight,
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
      const curAlign = selected.align ?? toolsCfg.text.align;
      const curLineHeight = selected.lineHeight ?? toolsCfg.text.lineHeight;
      textStyleCtx = {
        fontStyle: curStyle,
        textDecoration: curDeco,
        fontFamily: curFamily,
        backgroundColor: curBg,
        bgPadding: selected.bgPadding ?? toolsCfg.text.backgroundPadding,
        align: curAlign,
        lineHeight: curLineHeight,
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
        setAlign: (v) => {
          updateAnnotation(selected.id, { align: v });
          if (remember) patchLastUsed({ text: { align: v } });
          else void updateSettings("tools", { text: { ...baseText(), align: v } });
        },
        setLineHeight: (v) => {
          updateAnnotation(selected.id, { lineHeight: v });
          if (remember) patchLastUsed({ text: { lineHeight: v } });
          else void updateSettings("tools", { text: { ...baseText(), lineHeight: v } });
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
      align: toolsCfg.text.align,
      lineHeight: toolsCfg.text.lineHeight,
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
      align: toolsCfg.text.align,
      lineHeight: toolsCfg.text.lineHeight,
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
      setAlign: (v) => {
        if (remember) patchLastUsed({ text: { align: v } });
        else void updateSettings("tools", { text: { ...baseText(), align: v } });
      },
      setLineHeight: (v) => {
        if (remember) patchLastUsed({ text: { lineHeight: v } });
        else void updateSettings("tools", { text: { ...baseText(), lineHeight: v } });
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
  const lastLayerCaptureKind: CaptureKind =
    fullConfig.lastUsed?.lastLayerCaptureKind ?? "full";

  // Output split button: default primary is Copy (the most common single action
  // for a screenshot), then remembers whatever was last used.
  const lastExportAction: ExportAction =
    fullConfig.lastUsed?.lastExportAction ?? "copy";

  const runExport = (action: ExportAction) => {
    patchLastUsed({ lastExportAction: action });
    void doExport(action);
  };

  /** Fire a capture. `asLayer` tells Rust the result should be added as a new
   * image layer instead of replacing the workspace; it rides the whole capture
   * round-trip server-side, so a cancelled selection can't strand it. */
  const dispatchCapture = (kind: string, asLayer: boolean, what: string) => {
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("trigger_capture_command", { kind, asLayer });
      } catch (err) {
        console.error(`trigger_capture_command(${kind}) failed`, err);
        toast.error(`${what} failed`, { description: String(err) });
      }
    })();
  };

  const triggerCapture = (kind: CaptureKind, asLayer = false) => {
    patchLastUsed(
      asLayer ? { lastLayerCaptureKind: kind } : { lastCaptureKind: kind },
    );
    dispatchCapture(kind, asLayer, "Capture");
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
    0,
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

  const hasContext =
    // Crop owns the sidebar via EditorStage's own portal; don't also fill it
    // from here (a selected image would otherwise stack z-order controls).
    tool !== "crop" &&
    !!(
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

  // Resolved panel kind: a selected annotation's type wins over the active tool
  // (editing an element shows that element's controls).
  const panelKind = selected ? selected.type : tool;

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
              onCapture={(kind) => triggerCapture(kind)}
              onScrollCapture={() =>
                dispatchCapture("scroll", false, "Scrolling capture")
              }
              onSystemAreaCapture={
                IS_MAC
                  ? () =>
                      dispatchCapture("systemArea", false, "System area capture")
                  : undefined
              }
              systemAreaAccelerator={fullConfig.hotkeys.captureSystemArea}
              accelerators={captureAccelerators}
            />
            {/* Same capture kinds, different destination: the result lands as a
                new image layer. Meaningless without a base image to layer over,
                so it stays disabled until one exists. */}
            <CaptureSplitButton
              variant="layer"
              disabled={!hasImage}
              disabledReason="Capture something first — a layer needs an image to sit on"
              lastKind={lastLayerCaptureKind}
              onCapture={(kind) => triggerCapture(kind, true)}
              onScrollCapture={() =>
                dispatchCapture("scroll", true, "Scrolling capture")
              }
              onSystemAreaCapture={
                IS_MAC
                  ? () =>
                      dispatchCapture("systemArea", true, "System area capture")
                  : undefined
              }
              systemAreaAccelerator={fullConfig.hotkeys.captureSystemArea}
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
          {visibleTools.map((t) => (
            <ToolButton
              key={t.id}
              icon={t.icon}
              label={t.label}
              hint={t.hint}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            />
          ))}
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
      {hasContext && portalTarget && createPortal(
        <ToolOptionsPanel
          kind={panelKind}
          colorCtx={colorCtx}
          widthCtx={widthCtx}
          sizeCtx={sizeCtx}
          cornerCtx={cornerCtx}
          penLevelCtx={penLevelCtx}
          magnifyLinkCtx={magnifyLinkCtx}
          rectShapeCtx={rectShapeCtx}
          penModeCtx={penModeCtx}
          magnifyShapeCtx={magnifyShapeCtx}
          arrowHeadsCtx={arrowHeadsCtx}
          arrowDashCtx={arrowDashCtx}
          textStyleCtx={textStyleCtx}
          pinLabelCtx={pinLabelCtx}
          pinBorderCtx={pinBorderCtx}
          pinBorderWidthCtx={pinBorderWidthCtx}
          pinShapeCtx={pinShapeCtx}
          pinTailCtx={pinTailCtx}
          colorInputRef={colorInputRef}
          selected={!!selected}
          lastBgColor={lastBgColor}
          setLastBgColor={setLastBgColor}
          stickerEntries={stickerEntries}
          stickerSelection={stickerSelection}
          onSelectSticker={setStickerSelection}
          stickerPicker={tool === "sticker"}
          numbering={
            tool === "pin"
              ? {
                  next: nextPinNumber,
                  onChangeNext,
                  onSave: savePersisted,
                  onClear: clearPersisted,
                  onToggleContinuity: toggleContinuity,
                  continuityOn: pinsCfg.continuityMode === "continue",
                  clearTo: pinsCfg.defaultStartNumber - 1,
                }
              : null
          }
          reorder={
            selected
              ? {
                  atFront,
                  atBack,
                  onReorder: (mode) => reorderAnnotation(selected.id, mode),
                }
              : null
          }
        />,
        portalTarget,
      )}
    </div>
  );
}
