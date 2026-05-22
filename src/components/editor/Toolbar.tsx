"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, STICKERS, type Tool } from "@/stores/editor";
import { useSettings } from "@/stores/settings";

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
  const toolsCfg = useSettings((s) => s.config.tools);
  const updateSettings = useSettings((s) => s.update);

  const selected = selectedId
    ? annotations.find((a) => a.id === selectedId) ?? null
    : null;

  type ColorCtx = {
    label: string;
    value: string;
    onChange: (v: string) => void;
  };
  let colorCtx: ColorCtx | null = null;
  if (selected) {
    if (selected.type === "rect" || selected.type === "arrow") {
      colorCtx = {
        label: "Stroke",
        value: selected.stroke,
        onChange: (v) => updateAnnotation(selected.id, { stroke: v }),
      };
    } else if (selected.type === "text") {
      colorCtx = {
        label: "Color",
        value: selected.fill,
        onChange: (v) => updateAnnotation(selected.id, { fill: v }),
      };
    } else if (selected.type === "pin") {
      colorCtx = {
        label: "Color",
        value: selected.color,
        onChange: (v) => updateAnnotation(selected.id, { color: v }),
      };
    }
  } else if (tool === "rect" || tool === "arrow") {
    colorCtx = {
      label: "Stroke",
      value: toolsCfg.strokeColor,
      onChange: (v) => void updateSettings("tools", { strokeColor: v }),
    };
  } else if (tool === "text") {
    colorCtx = {
      label: "Color",
      value: toolsCfg.text.color,
      onChange: (v) =>
        void updateSettings("tools", {
          text: { fontSize: toolsCfg.text.fontSize, color: v },
        }),
    };
  } else if (tool === "pin") {
    colorCtx = {
      label: "Color",
      value: pinsCfg.defaultColor,
      onChange: (v) => void updateSettings("pins", { defaultColor: v }),
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
      {colorCtx && (
        <>
          <div className="mx-2 h-5 w-px bg-neutral-800" />
          <label
            className="flex items-center gap-1.5 text-xs text-neutral-300"
            title={selected ? "Edit selected element color" : "Default color for next element"}
          >
            {colorCtx.label}
            <input
              type="color"
              value={colorCtx.value}
              onChange={(e) => colorCtx!.onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
            />
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
            {flash && (
              <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-200">
                {flash}
              </span>
            )}
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
    </div>
  );
}
