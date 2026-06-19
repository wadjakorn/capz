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
  Label,
  Line,
  Shape,
  Tag,
  Transformer,
} from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import {
  useEditor,
  clampZoom,
  type Annotation,
  type RectAnnotation,
  type ArrowAnnotation,
  type TextAnnotation,
  type BlurAnnotation,
  type StickerAnnotation,
  type PinAnnotation,
} from "@/stores/editor";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import {
  setStage,
  getStage,
  runPrepareExport,
  setPrepareExport,
  setStageImageSize,
  clearStageImageSize,
  setScrollContainer,
} from "@/lib/stageBridge";
import { toast } from "sonner";
import { effectiveTools, type AppConfig } from "@/lib/config";
import { Rulers } from "@/components/editor/Rulers";
import { OcrLayer } from "@/components/editor/OcrLayer";
import { useOcr } from "@/stores/ocr";
import { annotationAABB, aabbSnapLinesX, aabbSnapLinesY, type AABB } from "@/lib/annotationBounds";
import { snapAxis } from "@/lib/snap";

const SNAP_SCREEN_PX = 6;

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
      return {
        text: {
          color: a.fill,
          fontSize: a.fontSize,
          fontStyle: a.fontStyle,
          textDecoration: a.textDecoration,
          fontFamily: a.fontFamily,
          backgroundColor: a.backgroundColor,
        },
      };
    case "blur":
      return { blur: { blurRadius: a.blurRadius } };
    case "sticker":
      return a.kind === "image" || !a.char
        ? { sticker: { fontSize: a.fontSize } }
        : { sticker: { fontSize: a.fontSize }, stickerEmoji: a.char };
    case "pin":
      return {
        pin: {
          color: a.color,
          size: a.size,
          labelColor: a.labelColor,
          borderColor: a.borderColor,
          borderWidth: a.borderWidth,
          shape: a.shape,
          bubbleTail: a.bubbleTail,
        },
      };
  }
}

const MIN_PADDING = 24;
const FIT_INSET = 32;

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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayScale = useEditor((s) => s.displayScale);
  const zoomFit = useEditor((s) => s.zoomFit);
  const setDisplayScale = useEditor((s) => s.setDisplayScale);
  const guides = useEditor((s) => s.guides);
  const setGuides = useEditor((s) => s.setGuides);

  const tool = useEditor((s) => s.tool);
  const annotations = useEditor((s) => s.annotations);
  const selectedId = useEditor((s) => s.selectedId);
  const stickerSelection = useEditor((s) => s.stickerSelection);
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
  const setStickerSelection = useEditor((s) => s.setStickerSelection);
  const lastUsedInit = useRef(false);
  useEffect(() => {
    if (!settingsReady || lastUsedInit.current) return;
    lastUsedInit.current = true;
    if (config.general.rememberLastTool && config.lastUsed) {
      if (config.lastUsed.tool) setTool(config.lastUsed.tool);
      if (config.lastUsed.stickerEmoji)
        setStickerSelection({ kind: "emoji", char: config.lastUsed.stickerEmoji });
    }
  }, [settingsReady, config.general.rememberLastTool, config.lastUsed, setTool, setStickerSelection]);

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
        stickerEmoji: (() => {
          const sel = useEditor.getState().stickerSelection;
          return (
            pendingLastUsed.current.stickerEmoji ??
            cur.stickerEmoji ??
            (sel.kind === "emoji" ? sel.char : undefined)
          );
        })(),
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

  // Load image stickers from user-configured directory on first ready.
  // Loaded entries cache in the module-scoped store so subsequent editor
  // windows in the same webview reuse them (no re-scan per editor open).
  const stickersLoaded = useStickers((s) => s.loaded);
  useEffect(() => {
    if (!settingsReady) return;
    if (stickersLoaded) return;
    const dir = config.stickers.directory;
    if (!dir) return;
    void useStickers.getState().load(dir);
  }, [settingsReady, stickersLoaded, config.stickers.directory]);

  useEffect(() => {
    setStage(stageRef.current);
    return () => setStage(null);
  }, [image]);

  // Cursor: switch to grabbing while dragging an existing element.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    const onStart = () => {
      container.style.cursor = "grabbing";
    };
    const onEnd = () => {
      // After drag, mouse is still over the shape — restore hover cursor
      // ("grab") instead of falling back to the stage tool cursor (crosshair).
      container.style.cursor = "grab";
    };
    stage.on("dragstart", onStart);
    stage.on("dragend", onEnd);
    return () => {
      stage.off("dragstart", onStart);
      stage.off("dragend", onEnd);
    };
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
    setScrollContainer(el);
    const ro = new ResizeObserver(() => {
      setContainer({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainer({ w: el.clientWidth, h: el.clientHeight });
    return () => {
      ro.disconnect();
      setScrollContainer(null);
    };
  }, []);

  // Cursor-anchored zoom: keep the image-coord point under the cursor pinned.
  const zoomAtClient = useRef<(factor: number, cx: number, cy: number) => void>(
    () => {},
  );
  useEffect(() => {
    zoomAtClient.current = (factor: number, clientX: number, clientY: number) => {
      const el = containerRef.current;
      const stage = stageRef.current;
      if (!el || !stage) return;
      const oldScale = useEditor.getState().displayScale || 1;
      const newScale = clampZoom(oldScale * factor);
      if (newScale === oldScale) return;
      const r0 = stage.container().getBoundingClientRect();
      const imgX = (clientX - r0.left) / oldScale;
      const imgY = (clientY - r0.top) / oldScale;
      setDisplayScale(newScale);
      requestAnimationFrame(() => {
        const r1 = stage.container().getBoundingClientRect();
        const wantLeft = clientX - imgX * newScale;
        const wantTop = clientY - imgY * newScale;
        el.scrollLeft += r1.left - wantLeft;
        el.scrollTop += r1.top - wantTop;
      });
    };
  }, [setDisplayScale]);

  // Wheel: Cmd/Ctrl → zoom; Shift → horizontal scroll; else → native vertical
  // (and trackpad horizontal) scroll. Middle-mouse drag → pan.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        zoomAtClient.current(factor, e.clientX, e.clientY);
        return;
      }
      if (e.shiftKey && e.deltaX === 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    let panning = false;
    let startClientX = 0;
    let startClientY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let prevCursor = "";
    let prevBodyCursor = "";
    let prevUserSelect = "";
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      panning = true;
      startClientX = e.clientX;
      startClientY = e.clientY;
      startScrollLeft = el.scrollLeft;
      startScrollTop = el.scrollTop;
      prevCursor = el.style.cursor;
      el.style.cursor = "grabbing";
      prevBodyCursor = document.body.style.cursor;
      document.body.style.cursor = "grabbing";
      prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      const sc = stageRef.current?.container();
      if (sc) sc.style.cursor = "grabbing";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return;
      el.scrollLeft = startScrollLeft - (e.clientX - startClientX);
      el.scrollTop = startScrollTop - (e.clientY - startClientY);
    };
    const endPan = () => {
      if (!panning) return;
      panning = false;
      el.style.cursor = prevCursor;
      document.body.style.cursor = prevBodyCursor;
      document.body.style.userSelect = prevUserSelect;
      const sc = stageRef.current?.container();
      if (sc) sc.style.cursor = "";
    };
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endPan);
    el.addEventListener("mouseleave", endPan);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endPan);
      el.removeEventListener("mouseleave", endPan);
    };
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

  // When useImage swaps to a new HTMLImageElement (next capture, paste, etc.),
  // reset displayScale to the 0 sentinel so the fit effect re-runs with the
  // new dimensions and the centering effect re-fires.
  const prevImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!image) return;
    if (prevImageRef.current === image) return;
    prevImageRef.current = image;
    setDisplayScale(0);
  }, [image, setDisplayScale]);

  // Publish the native image size for the export pipeline.
  useEffect(() => {
    if (imgW > 0 && imgH > 0) setStageImageSize(imgW, imgH);
    return () => clearStageImageSize();
  }, [imgW, imgH]);

  // First-load fit: when an image becomes available and the container has a
  // measurable size, derive an initial scale via zoomFit if the user hasn't
  // zoomed yet (displayScale === 0 sentinel).
  useEffect(() => {
    if (!imgW || !imgH) return;
    if (container.w <= 0 || container.h <= 0) return;
    if (displayScale !== 0) return;
    zoomFit({
      vw: Math.max(container.w - FIT_INSET * 2, 1),
      vh: Math.max(container.h - FIT_INSET * 2, 1),
      iw: imgW,
      ih: imgH,
    });
  }, [imgW, imgH, container.w, container.h, displayScale, zoomFit]);

  const scale = displayScale > 0 ? displayScale : 1;
  const stageW = imgW * scale;
  const stageH = imgH * scale;

  const padX = Math.max(MIN_PADDING, container.w);
  const padY = Math.max(MIN_PADDING, container.h);

  const snapEnabled = config.general.snapEnabled;
  const showRulers = config.general.showRulers;

  const snapDrag = (
    id: string,
    b: AABB,
    altKey: boolean,
  ): { dx: number; dy: number } => {
    if (!snapEnabled || altKey) {
      const cur = useEditor.getState().guides;
      if (cur.x.length || cur.y.length) setGuides({ x: [], y: [] });
      return { dx: 0, dy: 0 };
    }
    const xT: number[] = imgW > 0 ? [0, imgW / 2, imgW] : [];
    const yT: number[] = imgH > 0 ? [0, imgH / 2, imgH] : [];
    const all = useEditor.getState().annotations;
    for (const an of all) {
      if (an.id === id) continue;
      const ab = annotationAABB(an);
      if (!ab) continue;
      xT.push(...aabbSnapLinesX(ab));
      yT.push(...aabbSnapLinesY(ab));
    }
    const t = SNAP_SCREEN_PX / scale;
    const sx = snapAxis(b.x, b.w, xT, t);
    const sy = snapAxis(b.y, b.h, yT, t);
    setGuides({ x: sx ? [sx.guide] : [], y: sy ? [sy.guide] : [] });
    return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0 };
  };
  const endSnap = () => setGuides({ x: [], y: [] });

  // After first-load fit, center image in viewport via scroll.
  // Re-arms whenever displayScale resets to 0 (sentinel) — happens on
  // editor reset() for new captures, clipboard paste, or editor:clear.
  const centerOnNextFitRef = useRef(true);
  useEffect(() => {
    if (displayScale === 0) centerOnNextFitRef.current = true;
  }, [displayScale]);
  useEffect(() => {
    if (!centerOnNextFitRef.current) return;
    if (stageW <= 0 || stageH <= 0) return;
    if (container.w <= 0 || container.h <= 0) return;
    if (displayScale === 0) return;
    centerOnNextFitRef.current = false;
    const el = containerRef.current;
    if (!el) return;
    const left = padX + stageW / 2 - container.w / 2;
    const top = padY + stageH / 2 - container.h / 2;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ left, top, behavior: "instant" as ScrollBehavior });
      });
    });
  }, [stageW, stageH, container.w, container.h, padX, padY, displayScale]);

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
    if (e.evt.button !== 0) return;
    const p = getPointer();
    if (!p) return;
    const empty = isEmptyTarget(e);

    if (empty) {
      const hadSelection = useEditor.getState().selectedId !== null;
      const continuable = tool === "pin";
      if (hadSelection && !continuable) {
        select(null);
        if (tool !== "select") setTool("select");
        return;
      }
      if (!continuable) select(null);
    }

    if (textEditor) {
      commitTextEditor();
      return;
    }

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
      const a: StickerAnnotation =
        stickerSelection.kind === "image"
          ? {
              id: uid(),
              type: "sticker",
              x: p.x,
              y: p.y,
              kind: "image",
              src: stickerSelection.src,
              name: stickerSelection.name,
              fontSize: toolsCfg.sticker.fontSize,
            }
          : {
              id: uid(),
              type: "sticker",
              x: p.x,
              y: p.y,
              kind: "emoji",
              char: stickerSelection.char,
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
        labelColor: toolsCfg.pin.labelColor,
        borderColor: toolsCfg.pin.borderColor,
        borderWidth: toolsCfg.pin.borderWidth,
        shape: toolsCfg.pin.shape,
        bubbleTail: toolsCfg.pin.bubbleTail,
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
        fontStyle: toolsCfg.text.fontStyle,
        textDecoration: toolsCfg.text.textDecoration,
        fontFamily: toolsCfg.text.fontFamily,
        backgroundColor: toolsCfg.text.backgroundColor,
      };
      add(a);
      scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
    }
    setTextEditor(null);
  }

  // Register a synchronous pre-export hook so Save/Copy from the toolbar
  // produces a WYSIWYG image: commit any in-flight text edit, clear selection,
  // and force-clear transformer nodes before the next paint/toDataURL.
  const commitTextRef = useRef(commitTextEditor);
  commitTextRef.current = commitTextEditor;
  const textEditorOpenRef = useRef(textEditor !== null);
  textEditorOpenRef.current = textEditor !== null;
  useEffect(() => {
    setPrepareExport(() => {
      if (textEditorOpenRef.current) commitTextRef.current();
      useEditor.getState().select(null);
      useEditor.getState().setGuides({ x: [], y: [] });
      const tr = trRef.current;
      const htr = hoverTrRef.current;
      if (tr) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
      }
      if (htr) {
        htr.nodes([]);
        htr.getLayer()?.batchDraw();
      }
      setHoveredId(null);
    });
    return () => setPrepareExport(null);
  }, []);

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

  const sizerW = stageW > 0 ? stageW + padX * 2 : 0;
  const sizerH = stageH > 0 ? stageH + padY * 2 : 0;

  // Custom right-click menu. The native WebView "Copy image" grabs a single
  // (often transparent) Konva canvas layer → black paste; route Copy/Paste
  // through the working stage-export + paste_into_editor paths instead.
  function handleContextMenu(e: React.MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      return; // keep native menu for real text fields
    }
    // Over the OCR text layer, let the native Copy menu handle the selection.
    if (t && t.closest("[data-ocr-layer]")) {
      return;
    }
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  async function ctxCopy() {
    setCtxMenu(null);
    const stage = getStage();
    if (!stage) return;
    runPrepareExport();
    try {
      const { copyOnly } = await import("@/lib/exportImage");
      await copyOnly(stage);
      toast.success("Copied");
    } catch (err) {
      console.error("context copy failed", err);
      const { describeExportError } = await import("@/lib/exportErrors");
      const { title, detail } = describeExportError(err);
      toast.error(title, { description: detail });
    }
  }

  async function ctxPaste() {
    setCtxMenu(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<string>("paste_into_editor");
    } catch (err) {
      console.warn("paste_into_editor failed", err);
      toast.error("Clipboard has no image");
    }
  }

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctxMenu]);

  return (
    <div className="relative h-full w-full" onContextMenu={handleContextMenu}>
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-auto bg-[#0d021f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {status === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-400">
          Failed to load image: {src}
        </div>
      )}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/60">
          Loading…
        </div>
      )}
      {image && (
        <div
          style={{
            width: sizerW,
            height: sizerH,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: padX,
              top: padY,
            }}
          >
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          scaleX={scale}
          scaleY={scale}
          className={`bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55),0_2px_0_rgba(255,255,255,0.04)] ${cursorClass}`}
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
                snapDrag,
                endSnap,
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
              borderStroke="#a78bfa"
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
          <Layer listening={false}>
            {guides.x.map((gx, i) => (
              <Line
                key={`gx-${i}`}
                points={[gx, 0, gx, imgH]}
                stroke="#34d399"
                strokeWidth={1 / scale}
              />
            ))}
            {guides.y.map((gy, i) => (
              <Line
                key={`gy-${i}`}
                points={[0, gy, imgW, gy]}
                stroke="#34d399"
                strokeWidth={1 / scale}
              />
            ))}
          </Layer>
        </Stage>
        <OcrLayer scale={scale} />
          </div>
        </div>
      )}
      {textEditor && (() => {
        const editing = textEditor.id
          ? (annotations.find(
              (an) => an.id === textEditor.id && an.type === "text",
            ) as TextAnnotation | undefined)
          : undefined;
        const teFontSize = editing?.fontSize ?? toolsCfg.text.fontSize;
        const teColor = editing?.fill ?? toolsCfg.text.color;
        const teStyle = editing?.fontStyle ?? toolsCfg.text.fontStyle;
        const teDeco = editing?.textDecoration ?? toolsCfg.text.textDecoration;
        const teFamily = editing?.fontFamily ?? toolsCfg.text.fontFamily;
        const teBg =
          editing?.backgroundColor !== undefined
            ? editing.backgroundColor
            : toolsCfg.text.backgroundColor;
        const bold = teStyle.includes("bold");
        const italic = teStyle.includes("italic");
        return (
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
            fontFamily: teFamily,
            fontSize: Math.max(14, teFontSize * scale),
            fontWeight: bold ? 700 : 400,
            fontStyle: italic ? "italic" : "normal",
            textDecoration: teDeco || "none",
            color: teColor,
            background: teBg ?? "rgba(20,20,20,0.92)",
            border: `2px dashed ${toolsCfg.text.color}`,
            outline: "none",
            padding: 4,
            minWidth: 140,
            minHeight: Math.max(28, toolsCfg.text.fontSize * scale + 12),
            resize: "none",
            zIndex: 50,
            caretColor: teColor,
          }}
        />
        );
      })()}
    </div>
    {showRulers && (
      <Rulers
        containerEl={containerRef.current}
        containerW={container.w}
        containerH={container.h}
        padX={padX}
        padY={padY}
        scale={scale}
      />
    )}
    {ctxMenu && (
      <>
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setCtxMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu(null);
          }}
        />
        <div
          className="glass-card fixed z-50 min-w-36 overflow-hidden rounded-xl p-1 text-sm shadow-[0_18px_40px_-10px_rgba(0,0,0,0.55)]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!image}
            onClick={() => void ctxCopy()}
            className="flex w-full items-center rounded-lg px-3 py-1.5 text-left text-foreground/90 transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => void ctxPaste()}
            className="flex w-full items-center rounded-lg px-3 py-1.5 text-left text-foreground/90 transition-colors hover:bg-white/10"
          >
            Paste
          </button>
        </div>
      </>
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
  snapDrag: (id: string, b: AABB, altKey: boolean) => { dx: number; dy: number };
  endSnap: () => void;
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
      if (stage) stage.container().style.cursor = "grab";
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
      onDragMove={(e) => {
        const node = e.target;
        const { dx, dy } = ctx.snapDrag(
          a.id,
          { x: node.x(), y: node.y(), w: a.w, h: a.h },
          e.evt.altKey,
        );
        if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
      }}
      onDragEnd={(e) => {
        ctx.endSnap();
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
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          w: Math.round(Math.max(2, node.width() * sx)),
          h: Math.round(Math.max(2, node.height() * sy)),
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
      onDragMove={(e) => {
        const node = e.target;
        const baseX = Math.min(a.x1, a.x2);
        const baseY = Math.min(a.y1, a.y2);
        const w = Math.abs(a.x2 - a.x1);
        const h = Math.abs(a.y2 - a.y1);
        const { dx, dy } = ctx.snapDrag(
          a.id,
          { x: baseX + node.x(), y: baseY + node.y(), w, h },
          e.evt.altKey,
        );
        if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
      }}
      onDragEnd={(e) => {
        ctx.endSnap();
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
  const ref = useRef<Konva.Label>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  const bg = a.backgroundColor ?? null;
  const padding = bg ? 4 : 0;
  return (
    <Label
      ref={ref}
      x={a.x}
      y={a.y}
      rotation={a.rotation ?? 0}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDblClick={(e) => {
        ctx.onEditText?.(a, e.evt.clientX, e.evt.clientY);
      }}
      onDragMove={(e) => {
        const node = e.target;
        const ab = annotationAABB(a);
        if (!ab) return;
        const { dx, dy } = ctx.snapDrag(
          a.id,
          { x: node.x(), y: node.y(), w: ab.w, h: ab.h },
          e.evt.altKey,
        );
        if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
      }}
      onDragEnd={(e) => {
        ctx.endSnap();
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          fontSize: Math.round(Math.max(8, a.fontSize * sx)),
          rotation: node.rotation(),
        });
      }}
    >
      <Tag fill={bg ?? "rgba(0,0,0,0)"} />
      <Text
        text={a.text}
        fontSize={a.fontSize}
        fill={a.fill}
        fontStyle={a.fontStyle ?? "normal"}
        textDecoration={a.textDecoration ?? ""}
        fontFamily={a.fontFamily ?? "system-ui, sans-serif"}
        padding={padding}
      />
    </Label>
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
      onDragMove={(e) => {
        const node = e.target;
        const { dx, dy } = ctx.snapDrag(
          a.id,
          { x: node.x(), y: node.y(), w: a.w, h: a.h },
          e.evt.altKey,
        );
        if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
      }}
      onDragEnd={(e) => {
        ctx.endSnap();
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
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          w: Math.round(Math.max(4, a.w * sx)),
          h: Math.round(Math.max(4, a.h * sy)),
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
  const shape = a.shape ?? "circle";
  const fontSize = Math.max(10, a.size * (shape === "mappin" ? 0.46 : 0.55));
  const textW = a.size;
  const rot = a.rotation ?? 0;
  const borderColor = a.borderColor ?? "#ffffff";
  const borderWidth = a.borderWidth ?? 2;
  // Keep the number's text box inside the visible shape so it never inflates
  // the transformer bounds. For map-pin the number sits in the head bulb,
  // which is above the geometric centre; its box must still stay within the
  // centred size×size footprint (else the frame gets a gap above the bulb).
  const textH = shape === "mappin" ? a.size * 0.8 : a.size;
  const textCenterY = shape === "mappin" ? -a.size * 0.1 : 0;
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
      onDragMove={(e) => {
        const node = e.target;
        const s = a.size;
        const { dx, dy } = ctx.snapDrag(
          a.id,
          { x: node.x() - s / 2, y: node.y() - s / 2, w: s, h: s },
          e.evt.altKey,
        );
        if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
      }}
      onDragEnd={(e) => {
        ctx.endSnap();
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          size: Math.round(Math.max(12, a.size * sx)),
          rotation: node.rotation(),
        });
      }}
    >
      {shape === "circle" && (
        <Circle
          radius={r}
          fill={a.color}
          stroke={borderColor}
          strokeWidth={borderWidth}
        />
      )}
      {shape === "bubble" && (
        <Shape
          fill={a.color}
          stroke={borderColor}
          strokeWidth={borderWidth}
          sceneFunc={(c, sh) => {
            const w = a.size;
            const h = a.size * 0.78;
            const rr = a.size * 0.2;
            const x = -w / 2;
            const y = -h / 2;
            const tw = a.size * 0.16; // tail half-base
            const th = a.size * 0.26; // tail length
            const dir = a.bubbleTail ?? "down";
            // Walk the rounded-rect perimeter, injecting the triangular tail
            // mid-edge on the chosen side so the outline stays a single path.
            c.beginPath();
            c.moveTo(x + rr, y);
            if (dir === "up") {
              c.lineTo(-tw, y);
              c.lineTo(0, y - th);
              c.lineTo(tw, y);
            }
            c.lineTo(x + w - rr, y);
            c.quadraticCurveTo(x + w, y, x + w, y + rr);
            if (dir === "right") {
              c.lineTo(x + w, -tw);
              c.lineTo(x + w + th, 0);
              c.lineTo(x + w, tw);
            }
            c.lineTo(x + w, y + h - rr);
            c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
            if (dir === "down") {
              c.lineTo(tw, y + h);
              c.lineTo(0, y + h + th);
              c.lineTo(-tw, y + h);
            }
            c.lineTo(x + rr, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - rr);
            if (dir === "left") {
              c.lineTo(x, tw);
              c.lineTo(x - th, 0);
              c.lineTo(x, -tw);
            }
            c.lineTo(x, y + rr);
            c.quadraticCurveTo(x, y, x + rr, y);
            c.closePath();
            c.fillStrokeShape(sh);
          }}
        />
      )}
      {shape === "mappin" && (
        <Shape
          fill={a.color}
          stroke={borderColor}
          strokeWidth={borderWidth}
          sceneFunc={(c, sh) => {
            // Centred size×size footprint: head top at the box top, tip at the
            // box bottom → the transformer frame is a tight, centred square.
            const half = a.size * 0.5;
            const R = a.size * 0.4; // fat head radius
            const cY = -half + R; // head centre (-0.1*size)
            const tipY = half; // tip on the bottom edge
            const topY = -half; // head top on the top edge
            c.beginPath();
            c.moveTo(0, tipY);
            c.bezierCurveTo(-R * 1.6, cY + R * 0.55, -R * 1.15, topY, 0, topY);
            c.bezierCurveTo(R * 1.15, topY, R * 1.6, cY + R * 0.55, 0, tipY);
            c.closePath();
            c.fillStrokeShape(sh);
          }}
        />
      )}
      <Text
        text={label}
        fontSize={fontSize}
        fontStyle="bold"
        fill={a.labelColor ?? "#ffffff"}
        width={textW}
        height={textH}
        align="center"
        verticalAlign="middle"
        offsetX={textW / 2}
        offsetY={textH / 2 - textCenterY}
        rotation={-rot}
        listening={false}
      />
    </Group>
  );
}

function StickerShape({ a, ctx }: { a: StickerAnnotation; ctx: ShapeCtx }) {
  const textRef = useRef<Konva.Text>(null);
  const imgRef = useRef<Konva.Image>(null);
  const isImage = a.kind === "image" && !!a.src;
  const [img] = useImage(isImage ? (a.src as string) : "", "anonymous");
  useEffect(() => {
    ctx.setRef(isImage ? imgRef.current : textRef.current);
    return () => ctx.setRef(null);
  });
  if (isImage) {
    const naturalW = img?.naturalWidth ?? 0;
    const naturalH = img?.naturalHeight ?? 0;
    const ratio = naturalH > 0 ? naturalW / naturalH : 1;
    const h = a.fontSize;
    const w = h * ratio;
    return (
      <KonvaImage
        ref={imgRef}
        image={img}
        x={a.x}
        y={a.y}
        width={w}
        height={h}
        rotation={a.rotation ?? 0}
        draggable
        {...hoverHandlers(ctx)}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          ctx.onSelect();
        }}
        onDragMove={(e) => {
          const node = e.target;
          const { dx, dy } = ctx.snapDrag(
            a.id,
            { x: node.x(), y: node.y(), w, h },
            e.evt.altKey,
          );
          if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
        }}
        onDragEnd={(e) => {
          ctx.endSnap();
          ctx.onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = imgRef.current;
          if (!node) return;
          const sx = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          ctx.onChange({
            fontSize: Math.round(Math.max(12, a.fontSize * sx)),
            rotation: node.rotation(),
          });
        }}
      />
    );
  }
  return (
    <Text
      ref={textRef}
      x={a.x}
      y={a.y}
      rotation={a.rotation ?? 0}
      text={a.char ?? ""}
      fontSize={a.fontSize}
      draggable
      {...hoverHandlers(ctx)}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        ctx.onSelect();
      }}
      onDragMove={(e) => {
        const node = e.target;
        const s = a.fontSize;
        const { dx, dy } = ctx.snapDrag(
          a.id,
          { x: node.x(), y: node.y(), w: s, h: s * 1.2 },
          e.evt.altKey,
        );
        if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
      }}
      onDragEnd={(e) => {
        ctx.endSnap();
        ctx.onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = textRef.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        ctx.onChange({
          fontSize: Math.round(Math.max(12, a.fontSize * sx)),
          rotation: node.rotation(),
        });
      }}
    />
  );
}
