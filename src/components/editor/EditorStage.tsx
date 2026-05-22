"use client";

import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Arrow,
  Text,
  Circle,
  Group,
  Transformer,
} from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import {
  useEditor,
  type Annotation,
  type RectAnnotation,
  type ArrowAnnotation,
  type TextAnnotation,
  type BlurAnnotation,
  type StickerAnnotation,
  type PinAnnotation,
} from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { setStage } from "@/lib/stageBridge";
import { effectiveTools, type AppConfig } from "@/lib/config";

type Props = { src: string };

type Draft =
  | { kind: "rect"; id: string; x: number; y: number; w: number; h: number }
  | { kind: "arrow"; id: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: "blur"; id: string; x: number; y: number; w: number; h: number };

type TextEditor = {
  imgX: number;
  imgY: number;
  screenX: number;
  screenY: number;
  value: string;
  id?: string;
};

function uid() {
  return crypto.randomUUID();
}

function lastUsedPatchForAnnotation(a: Annotation): NonNullable<AppConfig["lastUsed"]> {
  switch (a.type) {
    case "rect":
      return { rect: { strokeColor: a.stroke, strokeWidth: a.strokeWidth } };
    case "arrow":
      return { arrow: { strokeColor: a.stroke, strokeWidth: a.strokeWidth } };
    case "text":
      return { text: { color: a.fill, fontSize: a.fontSize } };
    case "blur":
      return { blur: { blurRadius: a.blurRadius } };
    case "sticker":
      return { sticker: { fontSize: a.fontSize }, stickerEmoji: a.char };
    case "pin":
      return { pin: { color: a.color, size: a.size } };
  }
}

export function EditorStage({ src }: Props) {
  const [image, status] = useImage(src, "anonymous");
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const hoverTrRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditor | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tool = useEditor((s) => s.tool);
  const annotations = useEditor((s) => s.annotations);
  const selectedId = useEditor((s) => s.selectedId);
  const stickerChar = useEditor((s) => s.stickerChar);
  const nextPinNumber = useEditor((s) => s.nextPinNumber);
  const setNextPinNumber = useEditor((s) => s.setNextPinNumber);
  const add = useEditor((s) => s.add);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);

  const settingsReady = useSettings((s) => s.ready);
  const initSettings = useSettings((s) => s.init);
  const setLastUsed = useSettings((s) => s.setLastUsed);
  const config = useSettings((s) => s.config);
  const pinsCfg = config.pins;
  const toolsCfg = effectiveTools(config);

  const setTool = useEditor((s) => s.setTool);
  const setStickerChar = useEditor((s) => s.setStickerChar);
  const lastUsedInit = useRef(false);
  useEffect(() => {
    if (!settingsReady || lastUsedInit.current) return;
    lastUsedInit.current = true;
    if (config.general.rememberLastTool && config.lastUsed) {
      if (config.lastUsed.tool) setTool(config.lastUsed.tool);
      if (config.lastUsed.stickerEmoji) setStickerChar(config.lastUsed.stickerEmoji);
    }
  }, [settingsReady, config.general.rememberLastTool, config.lastUsed, setTool, setStickerChar]);

  const lastUsedTimer = useRef<number | null>(null);
  const pendingLastUsed = useRef<NonNullable<AppConfig["lastUsed"]>>({});
  const scheduleLastUsedWrite = (patch: NonNullable<AppConfig["lastUsed"]>) => {
    if (!config.general.rememberLastTool) return;
    pendingLastUsed.current = { ...pendingLastUsed.current, ...patch };
    if (lastUsedTimer.current) window.clearTimeout(lastUsedTimer.current);
    lastUsedTimer.current = window.setTimeout(() => {
      const cur = useSettings.getState().config.lastUsed ?? {};
      const merged: NonNullable<AppConfig["lastUsed"]> = {
        ...cur,
        ...pendingLastUsed.current,
        tool: useEditor.getState().tool,
        stickerEmoji: pendingLastUsed.current.stickerEmoji ?? cur.stickerEmoji ?? useEditor.getState().stickerChar,
        rect: { ...cur.rect, ...pendingLastUsed.current.rect },
        arrow: { ...cur.arrow, ...pendingLastUsed.current.arrow },
        text: { ...cur.text, ...pendingLastUsed.current.text },
        blur: { ...cur.blur, ...pendingLastUsed.current.blur },
        sticker: { ...cur.sticker, ...pendingLastUsed.current.sticker },
        pin: { ...cur.pin, ...pendingLastUsed.current.pin },
      };
      pendingLastUsed.current = {};
      void setLastUsed(merged);
    }, 500);
  };
  useEffect(() => () => {
    if (lastUsedTimer.current) window.clearTimeout(lastUsedTimer.current);
  }, []);

  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  useEffect(() => {
    setStage(stageRef.current);
    return () => setStage(null);
  }, [image]);

  const pinInit = useRef(false);
  useEffect(() => {
    if (!settingsReady || pinInit.current) return;
    pinInit.current = true;
    const start =
      pinsCfg.continuityMode === "continue"
        ? Math.max(pinsCfg.lastUsedNumber + 1, pinsCfg.defaultStartNumber)
        : pinsCfg.defaultStartNumber;
    setNextPinNumber(start);
  }, [settingsReady, pinsCfg.continuityMode, pinsCfg.lastUsedNumber, pinsCfg.defaultStartNumber, setNextPinNumber]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setContainer({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainer({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (textEditor && textareaRef.current) {
      const ta = textareaRef.current;
      const t = setTimeout(() => {
        ta.focus();
        ta.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [textEditor?.id, textEditor?.imgX, textEditor?.imgY]);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (!selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = nodeRefs.current.get(selectedId);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, annotations]);

  useEffect(() => {
    const tr = hoverTrRef.current;
    if (!tr) return;
    const showId = hoveredId && hoveredId !== selectedId ? hoveredId : null;
    if (!showId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = nodeRefs.current.get(showId);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [hoveredId, selectedId, annotations]);

  const imgW = image?.naturalWidth ?? 0;
  const imgH = image?.naturalHeight ?? 0;
  const padding = 24;
  const availW = Math.max(container.w - padding * 2, 1);
  const availH = Math.max(container.h - padding * 2, 1);
  const scale =
    imgW && imgH ? Math.min(availW / imgW, availH / imgH, 1) : 1;
  const stageW = imgW * scale;
  const stageH = imgH * scale;

  function getPointer(): { x: number; y: number } | null {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.getRelativePointerPosition();
  }

  function isEmptyTarget(e: Konva.KonvaEventObject<MouseEvent>): boolean {
    const t = e.target;
    return t === t.getStage() || t.name() === "bg-image";
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const p = getPointer();
    if (!p) return;
    const empty = isEmptyTarget(e);

    if (empty) select(null);

    if (tool === "select") return;
    if (!empty) return;

    if (tool === "rect") {
      setDraft({ kind: "rect", id: uid(), x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (tool === "arrow") {
      setDraft({ kind: "arrow", id: uid(), x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (tool === "blur") {
      setDraft({ kind: "blur", id: uid(), x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (tool === "sticker") {
      const a: StickerAnnotation = {
        id: uid(),
        type: "sticker",
        x: p.x,
        y: p.y,
        char: stickerChar,
        fontSize: toolsCfg.sticker.fontSize,
      };
      add(a);
      scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
      return;
    }
    if (tool === "pin") {
      const n = nextPinNumber;
      const a: PinAnnotation = {
        id: uid(),
        type: "pin",
        x: p.x,
        y: p.y,
        number: n,
        color: toolsCfg.pin.color,
        size: toolsCfg.pin.size,
      };
      add(a);
      void useSettings.getState().update("pins", { lastUsedNumber: n });
      scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
      return;
    }
    if (tool === "text") {
      const stage = stageRef.current;
      const ptr = stage?.getPointerPosition();
      const rect = stage?.container().getBoundingClientRect();
      if (!stage || !ptr || !rect) return;
      setTextEditor({
        imgX: p.x,
        imgY: p.y,
        screenX: rect.left + ptr.x,
        screenY: rect.top + ptr.y,
        value: "",
      });
    }
  }

  function commitTextEditor() {
    if (!textEditor) return;
    const v = textEditor.value.trim();
    if (textEditor.id) {
      if (v) update(textEditor.id, { text: v });
    } else if (v) {
      const a: TextAnnotation = {
        id: uid(),
        type: "text",
        x: textEditor.imgX,
        y: textEditor.imgY,
        text: v,
        fontSize: toolsCfg.text.fontSize,
        fill: toolsCfg.text.color,
      };
      add(a);
      scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
    }
    setTextEditor(null);
  }

  function handleMouseMove() {
    if (!draft) return;
    const p = getPointer();
    if (!p) return;
    if (draft.kind === "rect" || draft.kind === "blur") {
      setDraft({ ...draft, w: p.x - draft.x, h: p.y - draft.y });
    } else {
      setDraft({ ...draft, x2: p.x, y2: p.y });
    }
  }

  function handleMouseUp() {
    if (!draft) return;
    if (draft.kind === "rect") {
      const x = draft.w < 0 ? draft.x + draft.w : draft.x;
      const y = draft.h < 0 ? draft.y + draft.h : draft.y;
      const w = Math.abs(draft.w);
      const h = Math.abs(draft.h);
      if (w > 2 && h > 2) {
        const a: RectAnnotation = {
          id: draft.id,
          type: "rect",
          x,
          y,
          w,
          h,
          stroke: toolsCfg.rect.strokeColor,
          strokeWidth: toolsCfg.rect.strokeWidth,
        };
        add(a);
        scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
      }
    } else if (draft.kind === "blur") {
      const x = draft.w < 0 ? draft.x + draft.w : draft.x;
      const y = draft.h < 0 ? draft.y + draft.h : draft.y;
      const w = Math.abs(draft.w);
      const h = Math.abs(draft.h);
      if (w > 4 && h > 4) {
        const a: BlurAnnotation = {
          id: draft.id,
          type: "blur",
          x,
          y,
          w,
          h,
          blurRadius: toolsCfg.blur.blurRadius,
        };
        add(a);
        scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
      }
    } else {
      const dx = draft.x2 - draft.x1;
      const dy = draft.y2 - draft.y1;
      if (Math.hypot(dx, dy) > 4) {
        const a: ArrowAnnotation = {
          id: draft.id,
          type: "arrow",
          x1: draft.x1,
          y1: draft.y1,
          x2: draft.x2,
          y2: draft.y2,
          stroke: toolsCfg.arrow.strokeColor,
          strokeWidth: toolsCfg.arrow.strokeWidth,
        };
        add(a);
        scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
      }
    }
    setDraft(null);
  }

  function setNodeRef(id: string, node: Konva.Node | null) {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }

  const cursorClass =
    tool === "select"
      ? "cursor-default"
      : tool === "text"
        ? "cursor-text"
        : "cursor-crosshair";

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden bg-neutral-900"
    >
      {status === "failed" && (
        <div className="text-sm text-red-400">Failed to load image: {src}</div>
      )}
      {status === "loading" && (
        <div className="text-sm text-neutral-400">Loading…</div>
      )}
      {image && (
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          scaleX={scale}
          scaleY={scale}
          className={`bg-white shadow-lg ${cursorClass}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            <KonvaImage
              image={image}
              width={imgW}
              height={imgH}
              name="bg-image"
              listening
            />
            {annotations.map((a) =>
              renderAnnotation(a, {
                bgImage: image,
                onSelect: () => select(a.id),
                onHover: (h) => setHoveredId(h ? a.id : (cur) => (cur === a.id ? null : cur)),
                onChange: (patch) => {
                  update(a.id, patch);
                  const merged = { ...a, ...patch } as Annotation;
                  scheduleLastUsedWrite(lastUsedPatchForAnnotation(merged));
                },
                setRef: (n) => setNodeRef(a.id, n),
                onEditText: (t, sx, sy) =>
                  setTextEditor({
                    imgX: t.x,
                    imgY: t.y,
                    screenX: sx,
                    screenY: sy,
                    value: t.text,
                    id: t.id,
                  }),
              }),
            )}
            {draft?.kind === "rect" && (
              <Rect
                x={Math.min(draft.x, draft.x + draft.w)}
                y={Math.min(draft.y, draft.y + draft.h)}
                width={Math.abs(draft.w)}
                height={Math.abs(draft.h)}
                stroke={toolsCfg.rect.strokeColor}
                strokeWidth={toolsCfg.rect.strokeWidth}
                dash={[6, 4]}
                listening={false}
              />
            )}
            {draft?.kind === "blur" && (
              <Rect
                x={Math.min(draft.x, draft.x + draft.w)}
                y={Math.min(draft.y, draft.y + draft.h)}
                width={Math.abs(draft.w)}
                height={Math.abs(draft.h)}
                stroke="#60a5fa"
                strokeWidth={toolsCfg.rect.strokeWidth}
                dash={[6, 4]}
                listening={false}
              />
            )}
            {draft?.kind === "arrow" && (
              <Arrow
                points={[draft.x1, draft.y1, draft.x2, draft.y2]}
                stroke={toolsCfg.arrow.strokeColor}
                fill={toolsCfg.arrow.strokeColor}
                strokeWidth={toolsCfg.arrow.strokeWidth}
                pointerLength={toolsCfg.arrow.strokeWidth * 4}
                pointerWidth={toolsCfg.arrow.strokeWidth * 4}
                listening={false}
              />
            )}
            <Transformer
              ref={hoverTrRef}
              resizeEnabled={false}
              rotateEnabled={false}
              borderStroke="#38bdf8"
              borderStrokeWidth={1.5}
              listening={false}
            />
            <Transformer
              ref={trRef}
              rotateEnabled
              rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]}
              ignoreStroke
              boundBoxFunc={(_oldBox, newBox) => {
                if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                  return _oldBox;
                }
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      )}
      {textEditor && (
        <textarea
          ref={textareaRef}
          value={textEditor.value}
          onChange={(e) =>
            setTextEditor({ ...textEditor, value: e.target.value })
          }
          onBlur={commitTextEditor}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitTextEditor();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setTextEditor(null);
            }
          }}
          style={{
            position: "fixed",
            left: textEditor.screenX,
            top: textEditor.screenY,
            font: `${Math.max(14, toolsCfg.text.fontSize * scale)}px sans-serif`,
            color: toolsCfg.text.color,
            background: "rgba(20,20,20,0.92)",
            border: `2px dashed ${toolsCfg.text.color}`,
            outline: "none",
            padding: 4,
            minWidth: 140,
            minHeight: Math.max(28, toolsCfg.text.fontSize * scale + 12),
            resize: "none",
            zIndex: 50,
            caretColor: toolsCfg.text.color,
          }}
        />
      )}
    </div>
  );
}

type ShapeCtx = {
  bgImage: HTMLImageElement | undefined;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onChange: (patch: Partial<Annotation>) => void;
  setRef: (n: Konva.Node | null) => void;
  onEditText?: (a: TextAnnotation, screenX: number, screenY: number) => void;
};

function renderAnnotation(a: Annotation, ctx: ShapeCtx) {
  if (a.type === "rect") return <RectShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "arrow") return <ArrowShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "text") return <TextShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "blur") return <BlurShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "sticker") return <StickerShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "pin") return <PinShape key={a.id} a={a} ctx={ctx} />;
  return null;
}

function hoverHandlers(ctx: ShapeCtx) {
  return {
    onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
      ctx.onHover(true);
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "pointer";
    },
    onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
      ctx.onHover(false);
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = "";
    },
  };
}

function RectShape({ a, ctx }: { a: RectAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Rect>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  return (
    <Rect
      ref={ref}
      x={a.x}
      y={a.y}
      width={a.w}
      height={a.h}
      rotation={a.rotation ?? 0}
      stroke={a.stroke}
      strokeWidth={a.strokeWidth}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDragEnd={(e) => {
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          x: node.x(),
          y: node.y(),
          w: Math.max(2, node.width() * sx),
          h: Math.max(2, node.height() * sy),
          rotation: node.rotation(),
        });
      }}
    />
  );
}

function ArrowShape({ a, ctx }: { a: ArrowAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Arrow>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  return (
    <Arrow
      ref={ref}
      points={[a.x1, a.y1, a.x2, a.y2]}
      rotation={a.rotation ?? 0}
      stroke={a.stroke}
      fill={a.stroke}
      strokeWidth={a.strokeWidth}
      pointerLength={a.strokeWidth * 4}
      pointerWidth={a.strokeWidth * 4}
      hitStrokeWidth={Math.max(20, a.strokeWidth * 3)}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDragEnd={(e) => {
        const dx = e.target.x();
        const dy = e.target.y();
        e.target.position({ x: 0, y: 0 });
        ctx.onChange({
          x1: a.x1 + dx,
          y1: a.y1 + dy,
          x2: a.x2 + dx,
          y2: a.y2 + dy,
        });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        ctx.onChange({ rotation: node.rotation() });
      }}
    />
  );
}

function TextShape({ a, ctx }: { a: TextAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Text>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  return (
    <Text
      ref={ref}
      x={a.x}
      y={a.y}
      rotation={a.rotation ?? 0}
      text={a.text}
      fontSize={a.fontSize}
      fill={a.fill}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDblClick={(e) => {
        ctx.onEditText?.(a, e.evt.clientX, e.evt.clientY);
      }}
      onDragEnd={(e) => {
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          fontSize: Math.max(8, a.fontSize * sx),
          rotation: node.rotation(),
        });
      }}
    />
  );
}

function BlurShape({ a, ctx }: { a: BlurAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Image>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  useEffect(() => {
    const node = ref.current;
    if (!node || !ctx.bgImage) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [ctx.bgImage, a.x, a.y, a.w, a.h, a.blurRadius]);
  if (!ctx.bgImage) return null;
  return (
    <KonvaImage
      ref={ref}
      image={ctx.bgImage}
      x={a.x}
      y={a.y}
      rotation={a.rotation ?? 0}
      width={a.w}
      height={a.h}
      crop={{ x: a.x, y: a.y, width: a.w, height: a.h }}
      filters={[Konva.Filters.Blur]}
      blurRadius={a.blurRadius}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDragEnd={(e) => {
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          x: node.x(),
          y: node.y(),
          w: Math.max(4, a.w * sx),
          h: Math.max(4, a.h * sy),
          rotation: node.rotation(),
        });
      }}
    />
  );
}

function PinShape({ a, ctx }: { a: PinAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Group>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  const r = a.size / 2;
  const label = String(a.number);
  const fontSize = Math.max(10, a.size * 0.55);
  const textW = a.size;
  const rot = a.rotation ?? 0;
  return (
    <Group
      ref={ref}
      x={a.x}
      y={a.y}
      rotation={rot}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDragEnd={(e) => {
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          x: node.x(),
          y: node.y(),
          size: Math.max(12, a.size * sx),
          rotation: node.rotation(),
        });
      }}
    >
      <Circle radius={r} fill={a.color} stroke="#ffffff" strokeWidth={2} />
      <Text
        text={label}
        fontSize={fontSize}
        fontStyle="bold"
        fill="#ffffff"
        width={textW}
        height={a.size}
        align="center"
        verticalAlign="middle"
        offsetX={textW / 2}
        offsetY={a.size / 2}
        rotation={-rot}
        listening={false}
      />
    </Group>
  );
}

function StickerShape({ a, ctx }: { a: StickerAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Text>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  return (
    <Text
      ref={ref}
      x={a.x}
      y={a.y}
      rotation={a.rotation ?? 0}
      text={a.char}
      fontSize={a.fontSize}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDragEnd={(e) => {
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          fontSize: Math.max(12, a.fontSize * sx),
          rotation: node.rotation(),
        });
      }}
    />
  );
}
