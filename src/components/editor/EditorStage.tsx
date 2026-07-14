"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Arrow,
  Text,
  Circle,
  Ellipse,
  Group,
  Line,
  Shape,
  Transformer,
} from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import {
  useEditor,
  clampZoom,
  type Annotation,
  type ImageCrop,
  type RectAnnotation,
  type ArrowAnnotation,
  type TextAnnotation,
  type BlurAnnotation,
  type FreehandAnnotation,
  type HighlighterAnnotation,
  type MagnifyAnnotation,
  type StickerAnnotation,
  type PinAnnotation,
} from "@/stores/editor";
import { smoothPoints } from "@/lib/freehand";
import { useSettings } from "@/stores/settings";
import { useStickers } from "@/stores/stickers";
import { useOcr } from "@/stores/ocr";
import {
  setStage,
  getStage,
  runPrepareExport,
  setPrepareExport,
  setStageImageSize,
  clearStageImageSize,
  setStageExportBox,
  setScrollContainer,
} from "@/lib/stageBridge";
import { toast } from "sonner";
import { effectiveTools, type AppConfig } from "@/lib/config";
import { canvasFill, paddedBox } from "@/lib/backdrop";
import { Rulers } from "@/components/editor/Rulers";
import { OcrLayer } from "@/components/editor/OcrLayer";
import {
  annotationAABB,
  aabbSnapLinesX,
  aabbSnapLinesY,
  contentBounds,
  type AABB,
} from "@/lib/annotationBounds";
import { snapAxis } from "@/lib/snap";
import { isTauriRuntime } from "@/lib/platform";

const SNAP_SCREEN_PX = 6;

type Props = { src: string };

type Draft =
  | { kind: "rect"; id: string; x: number; y: number; w: number; h: number }
  | { kind: "arrow"; id: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: "line"; id: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: "blur"; id: string; x: number; y: number; w: number; h: number }
  | { kind: "magnify"; id: string; x: number; y: number; w: number; h: number }
  | { kind: "freehand"; id: string; tool: "pen" | "highlighter"; points: number[] };

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
      return {
        rect: {
          strokeColor: a.stroke,
          strokeWidth: a.strokeWidth,
          shape: a.shape,
          cornerRadius: a.cornerRadius,
        },
      };
    case "arrow":
      // A headless line belongs to the Shapes tool — persist it under the rect
      // slot so it never writes heads:"none" into the Arrow defaults (which would
      // make subsequently-drawn arrows headless).
      if (a.heads === "none") {
        return { rect: { strokeColor: a.stroke, strokeWidth: a.strokeWidth } };
      }
      return {
        arrow: {
          strokeColor: a.stroke,
          strokeWidth: a.strokeWidth,
          heads: a.heads,
          dash: a.dash,
        },
      };
    case "pen":
      return {
        pen: {
          strokeColor: a.stroke,
          strokeWidth: a.strokeWidth,
          mode: a.mode,
          polygonEpsilon: a.polygonEpsilon,
          curveSmoothing: a.curveSmoothing,
        },
      };
    case "highlighter":
      return {
        highlighter: {
          strokeColor: a.stroke,
          strokeWidth: a.strokeWidth,
          opacity: a.opacity,
        },
      };
    case "magnify":
      return {
        magnify: {
          strokeColor: a.stroke,
          strokeWidth: a.strokeWidth,
          shape: a.shape,
          zoom: a.zoom,
          areaOpacity: a.areaOpacity,
          linkDash: a.linkDash,
        },
      };
    case "text":
      return {
        text: {
          color: a.fill,
          fontSize: a.fontSize,
          fontStyle: a.fontStyle,
          textDecoration: a.textDecoration,
          fontFamily: a.fontFamily,
          backgroundColor: a.backgroundColor,
          backgroundPadding: a.bgPadding,
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
  const cropTrRef = useRef<Konva.Transformer>(null);
  const cropRectRef = useRef<Konva.Rect>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  // Pointer position for the highlighter's on-canvas brush guide (image coords).
  const [brushPoint, setBrushPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Live crop selection (in displayed-image coords) while the crop tool is active.
  const [cropSel, setCropSel] = useState<ImageCrop | null>(null);
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
  const imageCrop = useEditor((s) => s.imageCrop);
  const applyCrop = useEditor((s) => s.applyCrop);
  const backdropOn = useEditor((s) => s.backdropOn);

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
        // "crop" is a transient mode, not a persistable last-used tool.
        tool: (() => {
          const t = useEditor.getState().tool;
          return t === "crop" ? cur.tool : t;
        })(),
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
        pen: { ...cur.pen, ...pendingLastUsed.current.pen },
        highlighter: { ...cur.highlighter, ...pendingLastUsed.current.highlighter },
        magnify: { ...cur.magnify, ...pendingLastUsed.current.magnify },
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
    let prevW = el.clientWidth;
    let prevH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === prevW && h === prevH) return;
      prevW = w;
      prevH = h;
      setContainer({ w, h });
      // On window resize, re-fit + re-center to the new viewport — but only if
      // the user hasn't set a custom zoom (then their view is preserved). The
      // 0 sentinel re-arms the first-load fit and centering effects below.
      if (!useEditor.getState().userZoomed) setDisplayScale(0);
    });
    ro.observe(el);
    setContainer({ w: el.clientWidth, h: el.clientHeight });
    return () => {
      ro.disconnect();
      setScrollContainer(null);
    };
  }, [setDisplayScale]);

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
    // Arrows use their own inline handles, so they skip the box Transformer.
    // Highlighters attach it as a selection box (resize+rotate off); magnifiers
    // attach it to their source area (resize on, rotate off) — see the
    // Transformer's per-type props below.
    const selAnn = annotations.find((a) => a.id === selectedId);
    if (selAnn?.type === "arrow") {
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

  const srcW = image?.naturalWidth ?? 0;
  const srcH = image?.naturalHeight ?? 0;
  // Active crop into the source image (defaults to the whole image). All
  // annotation/pointer coordinates and the export region are expressed in this
  // cropped space, so `imgW`/`imgH` are the *displayed* image dimensions.
  const cropBase = imageCrop ?? { x: 0, y: 0, w: srcW, h: srcH };
  const imgW = cropBase.w;
  const imgH = cropBase.h;

  // Seed the crop selection to the full image when entering crop mode; drop it
  // on exit (Cancel/Esc/tool switch). Re-clamp if the image dimensions change.
  useEffect(() => {
    if (tool !== "crop") {
      setCropSel(null);
      return;
    }
    if (imgW <= 0 || imgH <= 0) return;
    setCropSel((cur) => (cur ? cur : { x: 0, y: 0, w: imgW, h: imgH }));
  }, [tool, imgW, imgH]);

  // Attach the dedicated crop Transformer to the crop box.
  useEffect(() => {
    const tr = cropTrRef.current;
    if (!tr) return;
    const node = tool === "crop" && cropSel ? cropRectRef.current : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [tool, cropSel]);

  const applyCropNow = () => {
    if (!cropSel || cropSel.w < 8 || cropSel.h < 8) {
      setTool("select");
      return;
    }
    applyCrop(cropSel, { w: srcW, h: srcH });
  };

  // Enter confirms the crop. (Esc cancels via the global editor shortcuts.)
  useEffect(() => {
    if (tool !== "crop") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        applyCropNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // applyCropNow closes over cropSel/srcW/srcH; re-bind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, cropSel, srcW, srcH]);

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

  // Canvas grows to the union of the image rect and any element that overflows
  // its edges; the origin goes negative for top/left overflow. With no overflow
  // this equals the image rect, so nothing about the default view changes.
  // Bounds come from each element's real rendered rect (node.getClientRect) so
  // the padding is pixel-accurate and identical on every side; a freshly-added
  // element with no node yet falls back to its estimated AABB for one frame.
  const canvasBg = config.general.canvasBackground;
  const backdrop = config.general.backdrop;
  // Clamp padding to a sane range; the padded frame is folded into contentBox
  // below (same mechanism as annotation overflow), so every overlay coordinate
  // formula that already keys off contentBox.x stays correct.
  const backdropPad = backdropOn ? Math.max(0, Math.min(backdrop.padding, 4096)) : 0;
  const backdropRadius = Math.max(0, backdrop.cornerRadius);
  // Shadow scaled to the padding so it stays proportional at any frame size.
  const backdropShadowBlur = Math.round(backdropPad * 0.5);
  const backdropShadowOffsetY = Math.round(backdropPad * 0.15);
  const [contentBox, setContentBox] = useState<AABB>({ x: 0, y: 0, w: 0, h: 0 });
  // True when any element extends past the image edges (padding excluded), so
  // the exposed band follows the backdrop rather than the flush canvas color.
  const [hasOverflow, setHasOverflow] = useState(false);
  // Bumped when an element's rendered size changes without an `annotations`
  // change — currently only an image sticker whose bitmap loads asynchronously.
  // Stable identity so it can sit in child effect deps without re-firing.
  const [boundsTick, setBoundsTick] = useState(0);
  const bumpBounds = useCallback(() => setBoundsTick((t) => t + 1), []);
  useEffect(() => {
    if (!(imgW > 0 && imgH > 0)) {
      setContentBox((prev) =>
        prev.w === 0 && prev.h === 0 && prev.x === 0 && prev.y === 0
          ? prev
          : { x: 0, y: 0, w: 0, h: 0 },
      );
      return;
    }
    const boxes: AABB[] = [];
    for (const a of annotations) {
      // `nodeRefs` is a ref (its identity never changes), so it is intentionally
      // NOT a dep — mutating it can't trigger this effect. Node-size changes
      // that don't flow through `annotations` are signalled via `boundsTick`.
      const node = nodeRefs.current.get(a.id);
      // Magnify registers only its source group, so its node rect misses the
      // output loupe — use the annotation AABB, which unions source + output.
      if (node && a.type !== "magnify") {
        const r = node.getClientRect({
          relativeTo: node.getLayer() ?? undefined,
          skipShadow: true,
        });
        boxes.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      } else {
        const est = annotationAABB(a);
        if (est) boxes.push(est);
      }
    }
    // Bounds before the backdrop padding is folded in — used to detect whether
    // any element actually overflows the image (padding alone is not overflow).
    const raw = contentBounds(imgW, imgH, boxes);
    setHasOverflow((prev) => {
      const overflow =
        raw.x !== 0 || raw.y !== 0 || raw.w !== imgW || raw.h !== imgH;
      return prev === overflow ? prev : overflow;
    });
    // Fold the backdrop padding into the content box: it grows the frame
    // uniformly around the image + any overflow, exactly like a symmetric
    // overflow, so the background Rect, export box, stage size and every
    // overlay origin (all keyed off contentBox) expand together.
    const next = paddedBox(raw, backdropPad);
    setContentBox((prev) =>
      prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
        ? prev
        : next,
    );
  }, [imgW, imgH, annotations, boundsTick, backdropPad]);

  // Publish the export region so Save/Copy snapshots the full expanded canvas.
  // `contentBox` is state with a guarded identity (only replaced on real change),
  // so depending on the whole object is correct and covers every field.
  useEffect(() => {
    if (contentBox.w > 0 && contentBox.h > 0) {
      setStageExportBox({
        x: contentBox.x,
        y: contentBox.y,
        w: contentBox.w,
        h: contentBox.h,
      });
    }
    return () => setStageExportBox(null);
  }, [contentBox]);

  const scale = displayScale > 0 ? displayScale : 1;
  const stageW = contentBox.w * scale;
  const stageH = contentBox.h * scale;

  // Konva draws the image through a shared, Stage-sized buffer canvas whenever
  // it has BOTH a corner radius and a shadow (Image._useBufferCanvas). On the
  // first frame after the image loads, contentBox — and thus stageW/stageH — is
  // still 0 (its measuring effect runs post-paint), so that buffer canvas is
  // 0×0 and drawImage(bufferCanvas, …) throws "InvalidStateError". Gate the
  // backdrop's buffer-triggering props on a non-zero stage so the transient
  // frame draws the image directly (no buffer); the backdrop appears the same
  // frame contentBox becomes non-zero.
  const backdropRender = backdropOn && stageW > 0 && stageH > 0;

  // Background fill for the canvas Rect. The exposed band (padded frame or an
  // overflow region around the image) follows the gradient/solid backdrop
  // whenever the frame is on OR an element overflows — so overflow no longer
  // falls back to a hard white `canvasBg`. With the backdrop off and nothing
  // overflowing, the Rect matches the image exactly, so the flush color only
  // shows through transparent images.
  const bgFill = useMemo(
    () =>
      canvasFill(
        backdrop,
        contentBox.w,
        contentBox.h,
        canvasBg,
        backdropOn || hasOverflow ? "backdrop" : "flush",
      ),
    [
      backdrop,
      backdropOn,
      hasOverflow,
      canvasBg,
      contentBox.w,
      contentBox.h,
    ],
  );

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
    // OCR read mode: suspend annotation drawing/selection on the stage; the
    // text overlay handles interaction.
    if (useOcr.getState().mode) return;
    // Crop mode: the crop box handles its own drag/resize; ignore stage clicks.
    if (tool === "crop") return;
    if (e.evt.button !== 0) return;
    const p = getPointer();
    if (!p) return;
    const empty = isEmptyTarget(e);

    if (empty) {
      const hadSelection = useEditor.getState().selectedId !== null;
      // Freehand tools stay active for repeated strokes (like pin) until Esc or
      // another tool is chosen, instead of snapping back to select after one.
      const continuable =
        tool === "pin" || tool === "pen" || tool === "highlighter";
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
      // The Shapes tool's line / dashed-line options draw a 2-point segment.
      if (toolsCfg.rect.shape === "line" || toolsCfg.rect.shape === "dashline") {
        setDraft({ kind: "line", id: uid(), x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      } else {
        setDraft({ kind: "rect", id: uid(), x: p.x, y: p.y, w: 0, h: 0 });
      }
      return;
    }
    if (tool === "arrow") {
      setDraft({ kind: "arrow", id: uid(), x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (tool === "pen" || tool === "highlighter") {
      setDraft({ kind: "freehand", id: uid(), tool, points: [p.x, p.y] });
      return;
    }
    if (tool === "magnify") {
      setDraft({ kind: "magnify", id: uid(), x: p.x, y: p.y, w: 0, h: 0 });
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
        bgPadding: toolsCfg.text.backgroundPadding,
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
    if (tool === "highlighter") setBrushPoint(getPointer());
    if (!draft) return;
    const p = getPointer();
    if (!p) return;
    if (
      draft.kind === "rect" ||
      draft.kind === "blur" ||
      draft.kind === "magnify"
    ) {
      setDraft({ ...draft, w: p.x - draft.x, h: p.y - draft.y });
    } else if (draft.kind === "arrow" || draft.kind === "line") {
      setDraft({ ...draft, x2: p.x, y2: p.y });
    } else if (draft.kind === "freehand") {
      setDraft({ ...draft, points: [...draft.points, p.x, p.y] });
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
          shape: toolsCfg.rect.shape,
          cornerRadius: toolsCfg.rect.cornerRadius,
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
    } else if (draft.kind === "arrow") {
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
          heads: toolsCfg.arrow.heads,
          dash: toolsCfg.arrow.dash,
        };
        add(a);
        scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
      }
    } else if (draft.kind === "line") {
      // Shapes-tool line: a headless arrow. Persists under the arrow's config.
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
          stroke: toolsCfg.rect.strokeColor,
          strokeWidth: toolsCfg.rect.strokeWidth,
          heads: "none",
          dash: toolsCfg.rect.shape === "dashline",
        };
        add(a);
      }
    } else if (draft.kind === "magnify") {
      // The drag defines the SOURCE (magnify) area; the output loupe is placed
      // beside it, sized by the configured zoom.
      const x = draft.w < 0 ? draft.x + draft.w : draft.x;
      const y = draft.h < 0 ? draft.y + draft.h : draft.y;
      const w = Math.abs(draft.w);
      const h = Math.abs(draft.h);
      // Respect the drag's aspect so the source can already be a rect/oval.
      const srw = w > 4 ? w / 2 : 40;
      const srh = h > 4 ? h / 2 : 40;
      const sx = w > 4 ? x + w / 2 : draft.x;
      const sy = h > 4 ? y + h / 2 : draft.y;
      const zoom = toolsCfg.magnify.zoom;
      const outW = srw * zoom;
      // Output sits to the right of the source, clear of it.
      const a: MagnifyAnnotation = {
        id: draft.id,
        type: "magnify",
        sx,
        sy,
        srw,
        srh,
        x: sx + srw + outW + 24,
        y: sy,
        zoom,
        shape: toolsCfg.magnify.shape,
        stroke: toolsCfg.magnify.strokeColor,
        strokeWidth: toolsCfg.magnify.strokeWidth,
        areaOpacity: toolsCfg.magnify.areaOpacity,
        linkDash: toolsCfg.magnify.linkDash,
      };
      add(a);
      scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
    } else if (draft.kind === "freehand") {
      if (draft.points.length >= 4) {
        if (draft.tool === "highlighter") {
          const a: HighlighterAnnotation = {
            id: draft.id,
            type: "highlighter",
            points: draft.points,
            stroke: toolsCfg.highlighter.strokeColor,
            strokeWidth: toolsCfg.highlighter.strokeWidth,
            opacity: toolsCfg.highlighter.opacity,
          };
          add(a);
          scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
        } else {
          const a: FreehandAnnotation = {
            id: draft.id,
            type: "pen",
            points: draft.points,
            stroke: toolsCfg.pen.strokeColor,
            strokeWidth: toolsCfg.pen.strokeWidth,
            mode: toolsCfg.pen.mode,
            polygonEpsilon: toolsCfg.pen.polygonEpsilon,
            curveSmoothing: toolsCfg.pen.curveSmoothing,
          };
          add(a);
          scheduleLastUsedWrite(lastUsedPatchForAnnotation(a));
        }
      }
    }
    setDraft(null);
  }

  function setNodeRef(id: string, node: Konva.Node | null) {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }

  // Highlighters attach the box Transformer purely as a selection box (no
  // resize/rotate). Magnifiers attach it to their source area to reshape it
  // (square↔rect, circle↔oval) but never rotate.
  const selectedType = annotations.find((a) => a.id === selectedId)?.type;
  const transformInteractive = selectedType !== "highlighter";
  const transformResizable = selectedType !== "highlighter";
  const transformRotatable =
    selectedType !== "highlighter" && selectedType !== "magnify";

  const cursorClass =
    tool === "select"
      ? "cursor-default"
      : tool === "text"
        ? "cursor-text"
        : tool === "highlighter"
          ? "cursor-none" // replaced by the on-canvas brush pill
          : tool === "pen"
            ? "cursor-pen"
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
    if (!isTauriRuntime()) {
      // Web build: the /paste page owns image loading — hand off to it.
      window.dispatchEvent(new CustomEvent("capz:web-paste"));
      return;
    }
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
      className="relative h-full w-full overflow-auto bg-[var(--bg-canvas)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
          offsetX={contentBox.x}
          offsetY={contentBox.y}
          className={`shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55),0_2px_0_rgba(255,255,255,0.04)] ${cursorClass}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setBrushPoint(null)}
        >
          <Layer>
            {/* Canvas background — fills the whole (possibly expanded) box,
                including overflow regions outside the image. listening=false so
                clicks on the bare background still start a draw on the Stage. */}
            <Rect
              x={contentBox.x}
              y={contentBox.y}
              width={contentBox.w}
              height={contentBox.h}
              {...bgFill}
              listening={false}
            />
            {/* With the padded frame off, the backdrop fill is only meant for the
                overflow band — so restore the flush canvas color behind the image
                itself, otherwise a transparent capture would show the backdrop
                through its interior once anything overflows. */}
            {!backdropOn && hasOverflow && (
              <Rect
                x={0}
                y={0}
                width={imgW}
                height={imgH}
                fill={canvasBg}
                listening={false}
              />
            )}
            <KonvaImage
              image={image}
              width={imgW}
              height={imgH}
              crop={{ x: cropBase.x, y: cropBase.y, width: cropBase.w, height: cropBase.h }}
              name="bg-image"
              listening
              cornerRadius={backdropRender ? backdropRadius : 0}
              shadowEnabled={backdropRender && backdrop.shadow}
              shadowColor="black"
              shadowBlur={backdropRender && backdrop.shadow ? backdropShadowBlur : 0}
              shadowOpacity={backdropRender && backdrop.shadow ? 0.35 : 0}
              shadowOffsetY={backdropRender && backdrop.shadow ? backdropShadowOffsetY : 0}
            />
            {annotations.map((a) =>
              renderAnnotation(a, {
                bgImage: image,
                cropOffX: cropBase.x,
                cropOffY: cropBase.y,
                selected: selectedId === a.id,
                scale,
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
                onBoundsChange: bumpBounds,
              }),
            )}
            {draft?.kind === "rect" && toolsCfg.rect.shape === "ellipse" && (
              <Shape
                x={Math.min(draft.x, draft.x + draft.w)}
                y={Math.min(draft.y, draft.y + draft.h)}
                width={Math.abs(draft.w)}
                height={Math.abs(draft.h)}
                stroke={toolsCfg.rect.strokeColor}
                strokeWidth={toolsCfg.rect.strokeWidth}
                dash={[6, 4]}
                listening={false}
                sceneFunc={(c, shape) => {
                  const w = shape.width();
                  const h = shape.height();
                  c.beginPath();
                  c.ellipse(
                    w / 2,
                    h / 2,
                    Math.max(0, w / 2),
                    Math.max(0, h / 2),
                    0,
                    0,
                    Math.PI * 2,
                  );
                  c.closePath();
                  c.strokeShape(shape);
                }}
              />
            )}
            {draft?.kind === "rect" && toolsCfg.rect.shape !== "ellipse" && (
              <Rect
                x={Math.min(draft.x, draft.x + draft.w)}
                y={Math.min(draft.y, draft.y + draft.h)}
                width={Math.abs(draft.w)}
                height={Math.abs(draft.h)}
                stroke={toolsCfg.rect.strokeColor}
                strokeWidth={toolsCfg.rect.strokeWidth}
                cornerRadius={toolsCfg.rect.cornerRadius}
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
                pointerAtBeginning={toolsCfg.arrow.heads === "both"}
                dash={
                  toolsCfg.arrow.dash
                    ? [toolsCfg.arrow.strokeWidth * 2, toolsCfg.arrow.strokeWidth * 2]
                    : undefined
                }
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            )}
            {draft?.kind === "line" && (
              <Line
                points={[draft.x1, draft.y1, draft.x2, draft.y2]}
                stroke={toolsCfg.rect.strokeColor}
                strokeWidth={toolsCfg.rect.strokeWidth}
                dash={
                  toolsCfg.rect.shape === "dashline"
                    ? [toolsCfg.rect.strokeWidth * 2, toolsCfg.rect.strokeWidth * 2]
                    : undefined
                }
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            )}
            {draft?.kind === "freehand" && (
              <Line
                points={draft.points}
                stroke={
                  draft.tool === "highlighter"
                    ? toolsCfg.highlighter.strokeColor
                    : toolsCfg.pen.strokeColor
                }
                strokeWidth={
                  draft.tool === "highlighter"
                    ? toolsCfg.highlighter.strokeWidth
                    : toolsCfg.pen.strokeWidth
                }
                opacity={
                  draft.tool === "highlighter" ? toolsCfg.highlighter.opacity : 1
                }
                globalCompositeOperation={
                  draft.tool === "highlighter" ? "multiply" : undefined
                }
                lineCap="round"
                lineJoin="round"
                tension={draft.tool === "pen" && toolsCfg.pen.mode === "curve" ? 0.5 : 0}
                listening={false}
              />
            )}
            {draft?.kind === "magnify" && (
              <Shape
                x={Math.min(draft.x, draft.x + draft.w)}
                y={Math.min(draft.y, draft.y + draft.h)}
                width={Math.abs(draft.w)}
                height={Math.abs(draft.h)}
                stroke={toolsCfg.magnify.strokeColor}
                strokeWidth={toolsCfg.magnify.strokeWidth}
                dash={[6, 4]}
                listening={false}
                sceneFunc={(c, shape) => {
                  const w = shape.width();
                  const h = shape.height();
                  c.beginPath();
                  if (toolsCfg.magnify.shape === "rect") {
                    c.rect(0, 0, w, h);
                  } else {
                    c.ellipse(
                      w / 2,
                      h / 2,
                      Math.max(0, w / 2),
                      Math.max(0, h / 2),
                      0,
                      0,
                      Math.PI * 2,
                    );
                  }
                  c.closePath();
                  c.strokeShape(shape);
                }}
              />
            )}
            {tool === "highlighter" && brushPoint && (() => {
              // Guide footprint equals the actual drawn width: max extent (the
              // pill height) == strokeWidth; a slim vertical pill hints direction.
              const w = toolsCfg.highlighter.strokeWidth;
              const pillW = w * 0.6;
              return (
                <Rect
                  x={brushPoint.x - pillW / 2}
                  y={brushPoint.y - w / 2}
                  width={pillW}
                  height={w}
                  cornerRadius={pillW / 2}
                  fill={toolsCfg.highlighter.strokeColor}
                  opacity={toolsCfg.highlighter.opacity}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={1 / scale}
                  listening={false}
                />
              );
            })()}
            {tool === "crop" && cropSel && (
              <>
                {/* Dim the area outside the crop selection (4 rects). */}
                <Rect x={0} y={0} width={imgW} height={cropSel.y} fill="rgba(0,0,0,0.5)" />
                <Rect
                  x={0}
                  y={cropSel.y + cropSel.h}
                  width={imgW}
                  height={Math.max(0, imgH - cropSel.y - cropSel.h)}
                  fill="rgba(0,0,0,0.5)"
                />
                <Rect x={0} y={cropSel.y} width={cropSel.x} height={cropSel.h} fill="rgba(0,0,0,0.5)" />
                <Rect
                  x={cropSel.x + cropSel.w}
                  y={cropSel.y}
                  width={Math.max(0, imgW - cropSel.x - cropSel.w)}
                  height={cropSel.h}
                  fill="rgba(0,0,0,0.5)"
                />
                <Rect
                  ref={cropRectRef}
                  x={cropSel.x}
                  y={cropSel.y}
                  width={cropSel.w}
                  height={cropSel.h}
                  stroke="#6d7cff"
                  strokeWidth={1.5 / scale}
                  dash={[6 / scale, 4 / scale]}
                  draggable
                  onDragMove={(e) => {
                    const n = e.target;
                    const nx = Math.max(0, Math.min(n.x(), imgW - cropSel.w));
                    const ny = Math.max(0, Math.min(n.y(), imgH - cropSel.h));
                    n.position({ x: nx, y: ny });
                    setCropSel({ ...cropSel, x: nx, y: ny });
                  }}
                  onTransformEnd={() => {
                    const n = cropRectRef.current;
                    if (!n) return;
                    const sx = n.scaleX();
                    const sy = n.scaleY();
                    n.scaleX(1);
                    n.scaleY(1);
                    let x = Math.max(0, Math.min(n.x(), imgW - 8));
                    let y = Math.max(0, Math.min(n.y(), imgH - 8));
                    let w = Math.max(8, Math.min(n.width() * sx, imgW - x));
                    let h = Math.max(8, Math.min(n.height() * sy, imgH - y));
                    x = Math.round(x);
                    y = Math.round(y);
                    w = Math.round(w);
                    h = Math.round(h);
                    n.position({ x, y });
                    setCropSel({ x, y, w, h });
                  }}
                />
                <Transformer
                  ref={cropTrRef}
                  rotateEnabled={false}
                  flipEnabled={false}
                  keepRatio={false}
                  ignoreStroke
                  borderStroke="#6d7cff"
                  anchorStroke="#6d7cff"
                  anchorFill="#ffffff"
                  boundBoxFunc={(oldBox, newBox) =>
                    Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8
                      ? oldBox
                      : newBox
                  }
                />
              </>
            )}
            <Transformer
              ref={hoverTrRef}
              resizeEnabled={false}
              rotateEnabled={false}
              borderStroke="#6d7cff"
              borderStrokeWidth={1.5}
              listening={false}
            />
            <Transformer
              ref={trRef}
              resizeEnabled={transformResizable}
              rotateEnabled={transformRotatable}
              rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]}
              // Resizable shapes ignore stroke so the box hugs the geometry; the
              // highlighter includes its (thick) stroke so the box tracks width.
              ignoreStroke={transformInteractive}
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
        <OcrLayer
          scale={scale}
          originPxX={-contentBox.x * scale}
          originPxY={-contentBox.y * scale}
        />
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
            padding: teBg ? "8px 12px" : 4,
            borderRadius: teBg ? 10 : 0,
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
        originX={contentBox.x}
        originY={contentBox.y}
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
          className="surface fixed z-50 min-w-36 overflow-hidden rounded-xl p-1 text-sm shadow-[0_18px_40px_-10px_rgba(0,0,0,0.55)]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!image}
            onClick={() => void ctxCopy()}
            className="flex w-full items-center rounded-lg px-3 py-1.5 text-left text-foreground/90 transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => void ctxPaste()}
            className="flex w-full items-center rounded-lg px-3 py-1.5 text-left text-foreground/90 transition-colors hover:bg-[var(--surface-raised)]"
          >
            Paste
          </button>
        </div>
      </>
    )}
    {tool === "crop" && image && (
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center">
        <div className="surface pointer-events-auto flex items-center gap-2 rounded-xl p-1.5 text-sm shadow-[0_18px_40px_-10px_rgba(0,0,0,0.55)]">
          <span className="px-2 text-foreground/60">
            {cropSel ? `${Math.round(cropSel.w)}×${Math.round(cropSel.h)}` : "Crop"}
          </span>
          <button
            type="button"
            onClick={() => setTool("select")}
            className="rounded-lg px-3 py-1.5 text-foreground/90 transition-colors hover:bg-[var(--surface-raised)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyCropNow}
            className="rounded-lg bg-[var(--accent,#6d7cff)] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
          >
            Apply crop
          </button>
        </div>
      </div>
    )}
    </div>
  );
}

type ShapeCtx = {
  bgImage: HTMLImageElement | undefined;
  /** Offset from cropped-image space to source-image pixels (for blur sampling). */
  cropOffX: number;
  cropOffY: number;
  /** Whether this annotation is the selected one (drives inline arrow handles). */
  selected: boolean;
  /** Current stage scale, so on-canvas handles keep a constant screen size. */
  scale: number;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onChange: (patch: Partial<Annotation>) => void;
  setRef: (n: Konva.Node | null) => void;
  onEditText?: (a: TextAnnotation, screenX: number, screenY: number) => void;
  snapDrag: (id: string, b: AABB, altKey: boolean) => { dx: number; dy: number };
  endSnap: () => void;
  /** Signal that this element's rendered size changed outside the annotation
   *  store (e.g. an image sticker's bitmap finished loading), so the canvas
   *  overflow box is recomputed. */
  onBoundsChange: () => void;
};

function renderAnnotation(a: Annotation, ctx: ShapeCtx) {
  if (a.type === "rect") return <RectShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "arrow") return <ArrowShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "text") return <TextShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "blur") return <BlurShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "pen") return <FreehandShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "highlighter")
    return <HighlighterShape key={a.id} a={a} ctx={ctx} />;
  if (a.type === "magnify") return <MagnifyShape key={a.id} a={a} ctx={ctx} />;
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
  // Rect and its ellipse variant share the same bounding-box model (x/y/w/h),
  // so they reuse identical drag/transform handlers. A callback ref stores the
  // node (Konva.Rect or Konva.Shape, both Konva.Shape) to sidestep ref variance.
  const ref = useRef<Konva.Shape | null>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  const setLocalRef = (n: Konva.Shape | null) => {
    ref.current = n;
  };
  const shared = {
    x: a.x,
    y: a.y,
    width: a.w,
    height: a.h,
    rotation: a.rotation ?? 0,
    stroke: a.stroke,
    strokeWidth: a.strokeWidth,
    draggable: true,
    ...hoverHandlers(ctx),
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      ctx.onSelect();
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const { dx, dy } = ctx.snapDrag(
        a.id,
        { x: node.x(), y: node.y(), w: a.w, h: a.h },
        e.evt.altKey,
      );
      if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      ctx.endSnap();
      ctx.onChange({ x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: () => {
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
    },
  };

  if (a.shape === "ellipse") {
    return (
      <Shape
        ref={setLocalRef}
        {...shared}
        hitStrokeWidth={Math.max(12, a.strokeWidth * 2)}
        sceneFunc={(c, shape) => {
          const w = shape.width();
          const h = shape.height();
          c.beginPath();
          c.ellipse(
            w / 2,
            h / 2,
            Math.max(0, w / 2),
            Math.max(0, h / 2),
            0,
            0,
            Math.PI * 2,
          );
          c.closePath();
          c.strokeShape(shape);
        }}
      />
    );
  }
  return (
    <Rect
      ref={setLocalRef}
      {...shared}
      cornerRadius={Math.max(0, a.cornerRadius ?? 0)}
    />
  );
}

/** Live geometry of an arrow while a control handle is being dragged. */
type ArrowGeom = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx?: number;
  cy?: number;
};

/**
 * Re-express a curve-control point relative to a new chord when one endpoint
 * moves, so the arrow keeps its visual bend (and a straight arrow stays
 * straight). The control is decomposed into (along-chord fraction, perpendicular
 * offset) against the old chord and rebuilt on the new one, scaling the
 * perpendicular offset by the length ratio.
 */
function remapArrowControl(
  oldA: { x: number; y: number },
  oldB: { x: number; y: number },
  newA: { x: number; y: number },
  newB: { x: number; y: number },
  ctrl: { x: number; y: number },
): { cx: number; cy: number } {
  const d0x = oldB.x - oldA.x;
  const d0y = oldB.y - oldA.y;
  const len0 = Math.hypot(d0x, d0y);
  const d1x = newB.x - newA.x;
  const d1y = newB.y - newA.y;
  const len1 = Math.hypot(d1x, d1y);
  if (len0 < 1e-6 || len1 < 1e-6) {
    return { cx: (newA.x + newB.x) / 2, cy: (newA.y + newB.y) / 2 };
  }
  const u0x = d0x / len0;
  const u0y = d0y / len0;
  const px = ctrl.x - oldA.x;
  const py = ctrl.y - oldA.y;
  const t = (px * u0x + py * u0y) / len0; // fraction along the chord
  const s = px * -u0y + py * u0x; // perpendicular offset (px)
  const u1x = d1x / len1;
  const u1y = d1y / len1;
  const sScaled = s * (len1 / len0);
  return {
    cx: newA.x + u1x * (t * len1) + -u1y * sScaled,
    cy: newA.y + u1y * (t * len1) + u1x * sScaled,
  };
}

const ARROW_HANDLE_COLOR = "#6d7cff";

function ArrowShape({ a, ctx }: { a: ArrowAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Arrow>(null);
  const [live, setLive] = useState<ArrowGeom | null>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });

  const g: ArrowGeom = live ?? {
    x1: a.x1,
    y1: a.y1,
    x2: a.x2,
    y2: a.y2,
    cx: a.cx,
    cy: a.cy,
  };
  const hasCurve = g.cx !== undefined && g.cy !== undefined;
  const mid = hasCurve
    ? { x: g.cx as number, y: g.cy as number }
    : { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 };
  const points = hasCurve
    ? [g.x1, g.y1, mid.x, mid.y, g.x2, g.y2]
    : [g.x1, g.y1, g.x2, g.y2];

  const commit = (next: ArrowGeom) => {
    const patch: Partial<Annotation> = {
      x1: next.x1,
      y1: next.y1,
      x2: next.x2,
      y2: next.y2,
    };
    if (next.cx !== undefined && next.cy !== undefined) {
      (patch as Partial<ArrowAnnotation>).cx = next.cx;
      (patch as Partial<ArrowAnnotation>).cy = next.cy;
    }
    ctx.onChange(patch);
    setLive(null);
  };

  const hr = Math.max(4, 6 / ctx.scale); // handle radius, constant on screen
  const hsw = 1.5 / ctx.scale;

  const dragEndpoint = (which: "tail" | "head") => (
    e: Konva.KonvaEventObject<DragEvent>,
  ) => {
    const n = e.target;
    const p = { x: n.x(), y: n.y() };
    const tail = which === "tail" ? p : { x: g.x1, y: g.y1 };
    const head = which === "head" ? p : { x: g.x2, y: g.y2 };
    const geom: ArrowGeom = { x1: tail.x, y1: tail.y, x2: head.x, y2: head.y };
    if (hasCurve) {
      const c = remapArrowControl(
        { x: g.x1, y: g.y1 },
        { x: g.x2, y: g.y2 },
        tail,
        head,
        mid,
      );
      geom.cx = c.cx;
      geom.cy = c.cy;
    }
    return geom;
  };

  return (
    <>
      <Arrow
        ref={ref}
        points={points}
        tension={hasCurve ? 0.5 : 0}
        rotation={a.rotation ?? 0}
        stroke={a.stroke}
        fill={a.stroke}
        strokeWidth={a.strokeWidth}
        pointerLength={a.strokeWidth * 4}
        pointerWidth={a.strokeWidth * 4}
        pointerAtEnding={(a.heads ?? "end") !== "none"}
        pointerAtBeginning={a.heads === "both"}
        dash={a.dash ? [a.strokeWidth * 2, a.strokeWidth * 2] : undefined}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={Math.max(20, a.strokeWidth * 3)}
        draggable
        {...hoverHandlers(ctx)}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          ctx.onSelect();
        }}
        onDragMove={(e) => {
          const node = e.target;
          const ab = annotationAABB(a);
          if (!ab) return;
          const { dx, dy } = ctx.snapDrag(
            a.id,
            { x: ab.x + node.x(), y: ab.y + node.y(), w: ab.w, h: ab.h },
            e.evt.altKey,
          );
          if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
        }}
        onDragEnd={(e) => {
          ctx.endSnap();
          const dx = e.target.x();
          const dy = e.target.y();
          e.target.position({ x: 0, y: 0 });
          const next: ArrowGeom = {
            x1: a.x1 + dx,
            y1: a.y1 + dy,
            x2: a.x2 + dx,
            y2: a.y2 + dy,
          };
          if (a.cx !== undefined && a.cy !== undefined) {
            next.cx = a.cx + dx;
            next.cy = a.cy + dy;
          }
          commit(next);
        }}
      />
      {ctx.selected && (
        <>
          {/* mid curve-control handle */}
          <Circle
            x={mid.x}
            y={mid.y}
            radius={hr}
            fill={ARROW_HANDLE_COLOR}
            stroke="#ffffff"
            strokeWidth={hsw}
            draggable
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              setLive({ ...g, cx: e.target.x(), cy: e.target.y() });
            }}
            onDragEnd={(e) => {
              commit({ ...g, cx: e.target.x(), cy: e.target.y() });
            }}
          />
          {/* tail + head endpoint handles */}
          {(["tail", "head"] as const).map((which) => (
            <Circle
              key={which}
              x={which === "tail" ? g.x1 : g.x2}
              y={which === "tail" ? g.y1 : g.y2}
              radius={hr}
              fill="#ffffff"
              stroke={ARROW_HANDLE_COLOR}
              strokeWidth={hsw}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onDragMove={(e) => {
                setLive(dragEndpoint(which)(e));
              }}
              onDragEnd={(e) => {
                commit(dragEndpoint(which)(e));
              }}
            />
          ))}
        </>
      )}
    </>
  );
}

/** Shared move/resize handling for point-path shapes (pen + highlighter): drag
 *  translates the raw points; the Transformer bakes scale/rotation into them via
 *  the node transform so the stored path stays axis-aligned. */
function usePathShape(a: FreehandAnnotation | HighlighterAnnotation, ctx: ShapeCtx) {
  const ref = useRef<Konva.Line>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  const handlers = {
    draggable: true,
    ...hoverHandlers(ctx),
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      ctx.onSelect();
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const ab = annotationAABB(a);
      if (!ab) return;
      const { dx, dy } = ctx.snapDrag(
        a.id,
        { x: ab.x + node.x(), y: ab.y + node.y(), w: ab.w, h: ab.h },
        e.evt.altKey,
      );
      if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      ctx.endSnap();
      const dx = e.target.x();
      const dy = e.target.y();
      e.target.position({ x: 0, y: 0 });
      ctx.onChange({
        points: a.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
      });
    },
    onTransformEnd: () => {
      const node = ref.current;
      if (!node) return;
      // Fold the node's scale/rotation/translation into the raw points so the
      // stored path is again untransformed (rotation baked in, reset to 0).
      const t = node.getTransform().copy();
      const out: number[] = [];
      for (let i = 0; i < a.points.length; i += 2) {
        const p = t.point({ x: a.points[i], y: a.points[i + 1] });
        out.push(p.x, p.y);
      }
      node.scaleX(1);
      node.scaleY(1);
      node.rotation(0);
      node.position({ x: 0, y: 0 });
      ctx.onChange({ points: out, rotation: 0 });
    },
  };
  return { ref, handlers };
}

function FreehandShape({ a, ctx }: { a: FreehandAnnotation; ctx: ShapeCtx }) {
  const { ref, handlers } = usePathShape(a, ctx);
  const { points, tension } = smoothPoints(a.points, a.mode, {
    polygonEpsilon: a.polygonEpsilon,
    curveSmoothing: a.curveSmoothing,
  });
  return (
    <Line
      ref={ref}
      points={points}
      tension={tension}
      rotation={a.rotation ?? 0}
      stroke={a.stroke}
      strokeWidth={a.strokeWidth}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(16, a.strokeWidth * 2)}
      {...handlers}
    />
  );
}

function HighlighterShape({
  a,
  ctx,
}: {
  a: HighlighterAnnotation;
  ctx: ShapeCtx;
}) {
  const { ref, handlers } = usePathShape(a, ctx);
  return (
    <Line
      ref={ref}
      points={a.points}
      rotation={a.rotation ?? 0}
      stroke={a.stroke}
      strokeWidth={a.strokeWidth}
      opacity={a.opacity ?? 0.5}
      lineCap="round"
      lineJoin="round"
      globalCompositeOperation="multiply"
      hitStrokeWidth={Math.max(16, a.strokeWidth)}
      {...handlers}
    />
  );
}

function MagnifyShape({ a, ctx }: { a: MagnifyAnnotation; ctx: ShapeCtx }) {
  // The source area is the Transformer target (reshape square↔rect, circle↔oval,
  // no rotate); the output loupe is a separate draggable node with a zoom handle.
  const sourceRef = useRef<Konva.Group>(null);
  const [live, setLive] = useState<Partial<MagnifyAnnotation>>({});
  useEffect(() => {
    ctx.setRef(sourceRef.current);
    return () => ctx.setRef(null);
  });

  const g = { ...a, ...live };
  const srcW = g.srw;
  const srcH = g.srh;
  const outW = srcW * g.zoom;
  const outH = srcH * g.zoom;
  const isRect = g.shape === "rect";
  const hr = Math.max(4, 6 / ctx.scale);
  const hsw = 1.5 / ctx.scale;
  const bw = Math.max(1, a.strokeWidth * 0.6);
  const linkDashed = a.linkDash ?? true;
  const areaFill = a.areaOpacity ?? 0.15;

  const commit = (patch: Partial<MagnifyAnnotation>) => {
    ctx.onChange(patch);
    setLive({});
  };
  const clip = (hw: number, hh: number) => (c: Konva.Context) => {
    c.beginPath();
    if (isRect) c.rect(-hw, -hh, hw * 2, hh * 2);
    else c.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2, false);
    c.closePath();
  };
  // A rect or ellipse centered on its group origin (0,0).
  const area = (hw: number, hh: number, props: Record<string, unknown>) =>
    isRect ? (
      <Rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} {...props} />
    ) : (
      <Ellipse x={0} y={0} radiusX={hw} radiusY={hh} {...props} />
    );
  // Point on the (possibly non-uniform) perimeter toward (tx,ty), so the
  // connector meets the area/loupe edges instead of their centers.
  const edge = (
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    tx: number,
    ty: number,
  ): [number, number] => {
    const dx = tx - cx;
    const dy = ty - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const w = Math.max(1, hw);
    const h = Math.max(1, hh);
    const s = isRect
      ? 1 / Math.max(Math.abs(ux) / w, Math.abs(uy) / h)
      : 1 / Math.sqrt((ux * ux) / (w * w) + (uy * uy) / (h * h));
    return [cx + ux * s, cy + uy * s];
  };
  const [lsx, lsy] = edge(g.sx, g.sy, srcW, srcH, g.x, g.y);
  const [lox, loy] = edge(g.x, g.y, outW, outH, g.sx, g.sy);

  return (
    <>
      {/* connector: source edge → output edge (dashed or solid per link type) */}
      <Line
        points={[lsx, lsy, lox, loy]}
        stroke={a.stroke}
        strokeWidth={bw}
        dash={linkDashed ? [4, 4] : undefined}
        listening={false}
      />
      {/* source (magnify) area — draggable to move, reshapable via Transformer.
          areaOpacity affects the fill only; the border always shows and follows
          the link (solid/dotted) style. */}
      <Group
        ref={sourceRef}
        x={g.sx}
        y={g.sy}
        draggable
        {...hoverHandlers(ctx)}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          ctx.onSelect();
        }}
        onDragMove={(e) =>
          setLive((p) => ({ ...p, sx: e.target.x(), sy: e.target.y() }))
        }
        onDragEnd={(e) => commit({ sx: e.target.x(), sy: e.target.y() })}
        onTransformEnd={(e) => {
          const node = e.target;
          const sxScale = node.scaleX();
          const syScale = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          node.rotation(0);
          commit({
            sx: node.x(),
            sy: node.y(),
            srw: Math.max(8, Math.round(a.srw * sxScale)),
            srh: Math.max(8, Math.round(a.srh * syScale)),
          });
        }}
      >
        {area(srcW, srcH, { fill: a.stroke, opacity: areaFill })}
        {area(srcW, srcH, {
          stroke: a.stroke,
          strokeWidth: bw,
          dash: linkDashed ? [Math.max(2, bw * 3), Math.max(2, bw * 3)] : undefined,
        })}
      </Group>
      {/* output loupe — draggable; magnified sample clipped to the shape */}
      <Group
        x={g.x}
        y={g.y}
        draggable
        {...hoverHandlers(ctx)}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          ctx.onSelect();
        }}
        onDragMove={(e) =>
          setLive((p) => ({ ...p, x: e.target.x(), y: e.target.y() }))
        }
        onDragEnd={(e) => commit({ x: e.target.x(), y: e.target.y() })}
      >
        <Group clipFunc={clip(outW, outH)}>
          {area(outW, outH, { fill: "rgba(0,0,0,0.001)" })}
          {ctx.bgImage && (
            <KonvaImage
              image={ctx.bgImage}
              x={-outW}
              y={-outH}
              width={outW * 2}
              height={outH * 2}
              crop={{
                x: g.sx - srcW + ctx.cropOffX,
                y: g.sy - srcH + ctx.cropOffY,
                width: srcW * 2,
                height: srcH * 2,
              }}
              listening={false}
            />
          )}
        </Group>
        {area(outW, outH, {
          stroke: a.stroke,
          strokeWidth: a.strokeWidth,
          dash: linkDashed
            ? [a.strokeWidth * 2.5, a.strokeWidth * 2.5]
            : undefined,
          listening: false,
        })}
      </Group>
      {/* zoom handle (output magnification) */}
      {ctx.selected && (
        <Circle
          x={g.x + outW}
          y={g.y}
          radius={hr}
          fill="#ffffff"
          stroke={a.stroke}
          strokeWidth={hsw}
          draggable
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onDragMove={(e) =>
            setLive((p) => ({
              ...p,
              zoom: Math.max(1.2, (e.target.x() - g.x) / srcW),
            }))
          }
          onDragEnd={(e) =>
            commit({ zoom: Math.max(1.2, (e.target.x() - g.x) / srcW) })
          }
        />
      )}
    </>
  );
}

// Shared offscreen canvas for measuring real glyph ink bounds. Konva sizes
// text by font em-box (≈ fontSize per line), which clips scripts whose marks
// stack outside the em box — e.g. Thai upper vowels + tone marks. measureText's
// actualBoundingBox ascent/descent report the true ink extent.
const _inkCanvas: HTMLCanvasElement | null =
  typeof document !== "undefined" ? document.createElement("canvas") : null;

function measureTextInk(
  text: string,
  fontSize: number,
  fontStyle: string,
  fontFamily: string,
): {
  ascent: number;
  descent: number;
  width: number;
  fontAscent: number;
  fontDescent: number;
} {
  const ctx = _inkCanvas?.getContext("2d");
  const lines = (text || " ").split("\n");
  if (!ctx) {
    // SSR / no canvas: fall back to em-box estimate.
    return {
      ascent: fontSize * 0.8,
      descent: fontSize * 0.2,
      width: 0,
      fontAscent: fontSize * 0.8,
      fontDescent: fontSize * 0.2,
    };
  }
  const cssStyle = fontStyle && fontStyle !== "normal" ? `${fontStyle} ` : "";
  ctx.font = `${cssStyle}${fontSize}px ${fontFamily}`;
  let ascent = 0;
  let descent = 0;
  let width = 0;
  let fontAscent = 0;
  let fontDescent = 0;
  for (const ln of lines) {
    const m = ctx.measureText(ln || " ");
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || fontSize * 0.8);
    descent = Math.max(descent, m.actualBoundingBoxDescent || fontSize * 0.2);
    width = Math.max(width, m.width);
    // Font-global metrics — Konva positions its alphabetic baseline from these.
    fontAscent = Math.max(fontAscent, m.fontBoundingBoxAscent || fontSize * 0.8);
    fontDescent = Math.max(
      fontDescent,
      m.fontBoundingBoxDescent || fontSize * 0.2,
    );
  }
  return { ascent, descent, width, fontAscent, fontDescent };
}

function TextShape({ a, ctx }: { a: TextAnnotation; ctx: ShapeCtx }) {
  const ref = useRef<Konva.Group>(null);
  useEffect(() => {
    ctx.setRef(ref.current);
    return () => ctx.setRef(null);
  });
  const bg = a.backgroundColor ?? null;
  // User-adjustable horizontal padding (px); vertical derived to keep the label
  // shape balanced. Falls back to a roomy default for pre-existing annotations.
  const padX = bg ? Math.max(0, a.bgPadding ?? 14) : 0;
  const padY = bg ? Math.round(padX * 0.66) : 0;
  const fontStyle = a.fontStyle ?? "normal";
  const textDecoration = a.textDecoration ?? "";
  const fontFamily = a.fontFamily ?? "system-ui, sans-serif";

  // Size the background Rect from real glyph ink (handles tall/stacked scripts
  // like Thai) plus padding, and offset the Text by its baseline so the ink
  // sits exactly inside the Rect with even padding — Konva's em-box metrics
  // would otherwise let stacked marks overflow.
  const box = useMemo(() => {
    const ink = measureTextInk(a.text, a.fontSize, fontStyle, fontFamily);
    const lines = (a.text || " ").split("\n").length;
    const lineGap = a.fontSize; // Konva default line height (1.0 × fontSize)
    const innerH = ink.ascent + ink.descent + (lines - 1) * lineGap;
    const w = ink.width + padX * 2;
    const h = innerH + padY * 2;
    // Konva (non-legacy) draws line 0's alphabetic baseline at this offset from
    // the Text node's top; shift the node so that baseline puts the ink top at padY.
    const konvaBaseline = (ink.fontAscent - ink.fontDescent) / 2 + a.fontSize / 2;
    const textY = padY + ink.ascent - konvaBaseline;
    return { w, h, textY };
  }, [a.text, a.fontSize, fontStyle, fontFamily, padX, padY]);

  const cornerRadius = bg
    ? Math.min(22, Math.max(6, Math.round(Math.min(box.w, box.h) * 0.18)))
    : 0;

  return (
    <Group
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
      {bg && (
        <Rect
          width={box.w}
          height={box.h}
          fill={bg}
          cornerRadius={cornerRadius}
        />
      )}
      <Text
        x={padX}
        y={box.textY}
        text={a.text}
        fontSize={a.fontSize}
        fill={a.fill}
        fontStyle={fontStyle}
        textDecoration={textDecoration}
        fontFamily={fontFamily}
      />
    </Group>
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
  }, [ctx.bgImage, a.x, a.y, a.w, a.h, a.blurRadius, ctx.cropOffX, ctx.cropOffY]);
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
      crop={{ x: a.x + ctx.cropOffX, y: a.y + ctx.cropOffY, width: a.w, height: a.h }}
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
  // An image sticker's real size only exists once its bitmap loads; recompute
  // the overflow box then (positions/size are otherwise driven by annotations).
  const onBoundsChange = ctx.onBoundsChange;
  useEffect(() => {
    if (isImage && img) onBoundsChange();
  }, [isImage, img, onBoundsChange]);
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
