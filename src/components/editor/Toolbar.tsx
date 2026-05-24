"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MousePointer2,
  ArrowUpRight,
  Square,
  Type,
  Droplet,
  Smile,
  MapPin,
  Undo2,
  Redo2,
  Copy as CopyIcon,
  Save,
  SaveAll,
  Trash2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import { useEditor, STICKERS, type Tool } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import { getStage, runPrepareExport } from "@/lib/stageBridge";
import { copyOnly, saveOnly, saveAndCopy } from "@/lib/exportImage";
import { describeExportError } from "@/lib/exportErrors";
import { effectiveTools, type AppConfig } from "@/lib/config";

type ToolDef = { id: Tool; label: string; hint: string; icon: LucideIcon };

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", hint: "V", icon: MousePointer2 },
  { id: "arrow", label: "Arrow", hint: "A", icon: ArrowUpRight },
  { id: "rect", label: "Rect", hint: "R", icon: Square },
  { id: "text", label: "Text", hint: "T", icon: Type },
  { id: "blur", label: "Blur", hint: "B", icon: Droplet },
  { id: "sticker", label: "Sticker", hint: "S", icon: Smile },
  { id: "pin", label: "Pin", hint: "P", icon: MapPin },
];

const EXPORT_ICONS: Record<"copy" | "file" | "both", LucideIcon> = {
  copy: CopyIcon,
  file: Save,
  both: SaveAll,
};

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

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const hasImage = useEditor((s) => s.hasImage);
  const stickerSelection = useEditor((s) => s.stickerSelection);
  const setStickerSelection = useEditor((s) => s.setStickerSelection);
  const stickerEntries = useStickers((s) => s.entries);
  const nextPinNumber = useEditor((s) => s.nextPinNumber);
  const setNextPinNumber = useEditor((s) => s.setNextPinNumber);
  const annotations = useEditor((s) => s.annotations);
  const selectedId = useEditor((s) => s.selectedId);
  const updateAnnotation = useEditor((s) => s.update);
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
      sticker: { ...cur.sticker, ...patch.sticker },
      pin: { ...cur.pin, ...patch.pin },
    };
    void setLastUsed(merged);
  };

  const [exporting, setExporting] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

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
    setFontStyle: (v: TextFontStyle) => void;
    setTextDecoration: (v: TextDecoration) => void;
    setFontFamily: (v: string) => void;
    setBackgroundColor: (v: string | null) => void;
  };
  let colorCtx: ColorCtx | null = null;
  let widthCtx: NumCtx | null = null;
  let sizeCtx: NumCtx | null = null;
  let textStyleCtx: TextStyleCtx | null = null;
  let pinLabelCtx: ColorCtx | null = null;

  if (selected) {
    if (selected.type === "rect" || selected.type === "arrow") {
      const slot = selected.type;
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
    } else if (selected.type === "text") {
      const baseText = () => ({
        fontSize: toolsCfg.text.fontSize,
        color: toolsCfg.text.color,
        fontStyle: toolsCfg.text.fontStyle,
        textDecoration: toolsCfg.text.textDecoration,
        fontFamily: toolsCfg.text.fontFamily,
        backgroundColor: toolsCfg.text.backgroundColor,
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
  } else if (tool === "text") {
    const baseText = () => ({
      fontSize: toolsCfg.text.fontSize,
      color: toolsCfg.text.color,
      fontStyle: toolsCfg.text.fontStyle,
      textDecoration: toolsCfg.text.textDecoration,
      fontFamily: toolsCfg.text.fontFamily,
      backgroundColor: toolsCfg.text.backgroundColor,
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

  type ExportAction = "copy" | "file" | "both";
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
                void (async () => {
                  const { invoke } = await import("@tauri-apps/api/core");
                  try {
                    await invoke("show_settings_command", { tab: "output" });
                  } catch (err) {
                    console.error("show_settings_command failed", err);
                  }
                })();
              },
            }
          : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 border-b border-neutral-800 bg-neutral-900 px-2 py-1.5 max-h-[40vh] overflow-y-auto">
      <div className="flex flex-wrap items-center gap-1">
      {TOOLS.map((t) => {
        const active = tool === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.hint})`}
            aria-label={t.label}
            className={[
              "flex h-8 w-8 items-center justify-center rounded transition-colors",
              active
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-800",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
      <div className="mx-2 h-5 w-px bg-neutral-800" />
      <button
        type="button"
        onClick={undo}
        disabled={!past}
        title="Undo (⌘Z)"
        aria-label="Undo"
        className="flex h-8 w-8 items-center justify-center rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Undo2 className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!future}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        className="flex h-8 w-8 items-center justify-center rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Redo2 className="h-4 w-4" aria-hidden />
      </button>
      <div className="mx-2 h-5 w-px bg-neutral-800" />
      <button
        type="button"
        onClick={() => {
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
        }}
        disabled={!hasImage}
        title={hasImage ? "Clear workspace (drop image + annotations)" : "Workspace already empty"}
        aria-label="Clear workspace"
        className="flex h-8 w-8 items-center justify-center rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      <div className="mx-2 h-5 w-px bg-neutral-800" />
      {(() => {
        const mode = fullConfig.output.defaultMode;
        const primaryAction: ExportAction =
          mode === "clipboard" ? "copy" : mode === "file" ? "file" : "both";
        const btn = (action: ExportAction, label: string, hint: string) => {
          const isPrimary = action === primaryAction;
          const Icon = EXPORT_ICONS[action];
          return (
            <button
              key={action}
              type="button"
              onClick={() => void doExport(action)}
              disabled={exporting}
              title={hint}
              aria-label={label}
              className={[
                "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                isPrimary
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {exporting && isPrimary ? "…" : label}
            </button>
          );
        };
        return (
          <div className="flex items-center gap-1">
            {btn("copy", "Copy", "Copy to clipboard (⌘C / Ctrl+C)")}
            {btn("file", "Save", "Save to file")}
            {btn("both", "Save & Copy", "Save to file and copy to clipboard")}
          </div>
        );
      })()}
      </div>
      <div className="flex min-h-[36px] flex-wrap items-center gap-1 border-t border-neutral-800 pt-1">
      {colorCtx && (
        <>
          <label
            className="flex items-center gap-1.5 text-xs text-neutral-300"
            title={selected ? "Edit selected element color" : "Default color for next element"}
          >
            {colorCtx.label}
            <input
              ref={colorInputRef}
              type="color"
              value={colorCtx.value}
              onChange={(e) => colorCtx!.onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
            />
          </label>
        </>
      )}
      {pinLabelCtx && (
        <label
          className="flex items-center gap-1.5 text-xs text-neutral-300"
          title="Pin number color"
        >
          {pinLabelCtx.label}
          <input
            type="color"
            value={pinLabelCtx.value}
            onChange={(e) => pinLabelCtx!.onChange(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
          />
        </label>
      )}
      {widthCtx && (
        <>
          <label
            className="flex items-center gap-1.5 text-xs text-neutral-300"
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
              className="h-1 w-24 cursor-pointer accent-neutral-200"
            />
            <span className="w-6 text-right tabular-nums">{Math.round(widthCtx.value)}</span>
          </label>
        </>
      )}
      {sizeCtx && (
        <>
          <label
            className="flex items-center gap-1.5 text-xs text-neutral-300"
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
              className="h-1 w-24 cursor-pointer accent-neutral-200"
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
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-800",
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
            <label className="flex items-center gap-1.5 text-xs text-neutral-300" title="Font family">
              Font
              <select
                value={tsc.fontFamily}
                onChange={(e) => tsc.setFontFamily(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-xs text-neutral-100 outline-none focus:border-neutral-500"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-neutral-300" title="Background / highlight">
              Bg
              <input
                type="color"
                value={tsc.backgroundColor ?? "#ffff00"}
                onChange={(e) => tsc.setBackgroundColor(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
                disabled={tsc.backgroundColor === null}
              />
              <button
                type="button"
                onClick={() => tsc.setBackgroundColor(tsc.backgroundColor === null ? "#ffff00" : null)}
                title={tsc.backgroundColor === null ? "Enable background" : "Disable background"}
                className={[
                  "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                  tsc.backgroundColor === null
                    ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
                ].join(" ")}
              >
                {tsc.backgroundColor === null ? "None" : "On"}
              </button>
            </label>
          </>
        );
      })()}
      {tool === "pin" && (
        <>
          <div className="flex items-center gap-2 text-xs text-neutral-300">
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
                className="w-14 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-center text-xs text-neutral-100 outline-none focus:border-neutral-500"
              />
            </label>
            <button
              type="button"
              onClick={savePersisted}
              title="Persist current as latest used number"
              className="rounded px-2 py-1 hover:bg-neutral-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={clearPersisted}
              title={`Clear persisted (reset to ${pinsCfg.defaultStartNumber - 1})`}
              className="rounded px-2 py-1 hover:bg-neutral-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={toggleContinuity}
              title="Toggle continuity across captures"
              className={[
                "rounded px-2 py-1 transition-colors",
                pinsCfg.continuityMode === "continue"
                  ? "bg-neutral-100 text-neutral-900"
                  : "hover:bg-neutral-800",
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
                        active ? "bg-neutral-100" : "hover:bg-neutral-800",
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
                        active ? "bg-neutral-100" : "hover:bg-neutral-800",
                      ].join(" ")}
                    >
                      {c}
                    </button>
                  );
                })}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
