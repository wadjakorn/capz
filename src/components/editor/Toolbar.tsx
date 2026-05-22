"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, STICKERS, type Tool } from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { getStage } from "@/lib/stageBridge";
import { exportAnnotated } from "@/lib/exportImage";
import { effectiveTools, type AppConfig } from "@/lib/config";

type ToolDef = { id: Tool; label: string; hint: string };

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", hint: "V" },
  { id: "arrow", label: "Arrow", hint: "A" },
  { id: "rect", label: "Rect", hint: "R" },
  { id: "text", label: "Text", hint: "T" },
  { id: "blur", label: "Blur", hint: "B" },
  { id: "sticker", label: "Sticker", hint: "S" },
  { id: "pin", label: "Pin", hint: "P" },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const stickerChar = useEditor((s) => s.stickerChar);
  const setStickerChar = useEditor((s) => s.setStickerChar);
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
  let colorCtx: ColorCtx | null = null;
  let widthCtx: NumCtx | null = null;
  let sizeCtx: NumCtx | null = null;

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
      colorCtx = {
        label: "Color",
        value: selected.fill,
        onChange: (v) => {
          updateAnnotation(selected.id, { fill: v });
          if (remember) patchLastUsed({ text: { color: v } });
          else void updateSettings("tools", { text: { fontSize: toolsCfg.text.fontSize, color: v } });
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
          else void updateSettings("tools", { text: { fontSize: v, color: toolsCfg.text.color } });
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
    colorCtx = {
      label: "Color",
      value: toolsCfg.text.color,
      onChange: (v) => {
        if (remember) patchLastUsed({ text: { color: v } });
        else void updateSettings("tools", { text: { fontSize: toolsCfg.text.fontSize, color: v } });
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
        else void updateSettings("tools", { text: { fontSize: v, color: toolsCfg.text.color } });
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

  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const notify = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  };
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

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

  const doExport = async () => {
    const stage = getStage();
    if (!stage || exporting) return;
    setExporting(true);
    try {
      const r = await exportAnnotated(stage, fullConfig);
      if (r.saved && r.copied) notify("Saved + copied");
      else if (r.saved) notify("Saved");
      else if (r.copied) notify("Copied");
    } catch (e) {
      console.error("export failed", e);
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-1 border-b border-neutral-800 bg-neutral-900 px-2 py-1.5">
      {TOOLS.map((t) => {
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.hint})`}
            className={[
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-800",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
      <div className="mx-2 h-5 w-px bg-neutral-800" />
      <button
        type="button"
        onClick={undo}
        disabled={!past}
        title="Undo (⌘Z)"
        className="rounded px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!future}
        title="Redo (⇧⌘Z)"
        className="rounded px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        Redo
      </button>
      <div className="mx-2 h-5 w-px bg-neutral-800" />
      <button
        type="button"
        onClick={() => void doExport()}
        disabled={exporting}
        title={`Export (${fullConfig.output.defaultMode})`}
        className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {exporting ? "…" : "Save"}
      </button>
      {colorCtx && (
        <>
          <div className="mx-2 h-5 w-px bg-neutral-800" />
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
      {widthCtx && (
        <>
          <div className="mx-2 h-5 w-px bg-neutral-800" />
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
              value={widthCtx.value}
              onChange={(e) => widthCtx!.onChange(parseInt(e.target.value, 10))}
              className="h-1 w-24 cursor-pointer accent-neutral-200"
            />
            <span className="w-6 text-right tabular-nums">{widthCtx.value}</span>
          </label>
        </>
      )}
      {sizeCtx && (
        <>
          <div className="mx-2 h-5 w-px bg-neutral-800" />
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
              value={sizeCtx.value}
              onChange={(e) => sizeCtx!.onChange(parseInt(e.target.value, 10))}
              className="h-1 w-24 cursor-pointer accent-neutral-200"
            />
            <span className="w-8 text-right tabular-nums">{sizeCtx.value}</span>
          </label>
        </>
      )}
      {tool === "pin" && (
        <>
          <div className="mx-2 h-5 w-px bg-neutral-800" />
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
          <div className="mx-2 h-5 w-px bg-neutral-800" />
          <div className="flex items-center gap-0.5">
            {STICKERS.map((c) => {
              const active = stickerChar === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setStickerChar(c)}
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
      {flash && (
        <span className="ml-auto rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-200">
          {flash}
        </span>
      )}
    </div>
  );
}
