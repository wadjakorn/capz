"use client";

import {
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  SendToBack,
} from "lucide-react";
import type { RefObject } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { StickerSelection } from "@/stores/editor";
import type { StickerEntry } from "@/stores/stickers";
import { ArrowPanel } from "./ArrowPanel";
import { BlurPanel } from "./BlurPanel";
import { HighlighterPanel } from "./HighlighterPanel";
import { MagnifyPanel } from "./MagnifyPanel";
import { PenPanel } from "./PenPanel";
import { PinPanel } from "./PinPanel";
import { ShapesPanel } from "./ShapesPanel";
import { StickerPanel } from "./StickerPanel";
import { TextPanel } from "./TextPanel";
import type {
  ArrowHeadsCtx,
  ColorCtx,
  MagnifyShapeCtx,
  NumCtx,
  PenModeCtx,
  PinShapeCtx,
  PinTailCtx,
  RectShapeCtx,
  TextStyleCtx,
  ToggleCtx,
} from "./types";

type ReorderMode = "front" | "back" | "forward" | "backward";

function ReorderButton({
  Icon,
  title,
  onClick,
  disabled,
}: {
  Icon: typeof BringToFront;
  title: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
}

export type ToolOptionsPanelProps = {
  /** Resolved panel kind: the selected annotation's type, else the active tool. */
  kind: string;
  colorCtx: ColorCtx | null;
  widthCtx: NumCtx | null;
  sizeCtx: NumCtx | null;
  cornerCtx: NumCtx | null;
  penLevelCtx: NumCtx | null;
  magnifyLinkCtx: ToggleCtx | null;
  rectShapeCtx: RectShapeCtx | null;
  penModeCtx: PenModeCtx | null;
  magnifyShapeCtx: MagnifyShapeCtx | null;
  arrowHeadsCtx: ArrowHeadsCtx | null;
  arrowDashCtx: ToggleCtx | null;
  textStyleCtx: TextStyleCtx | null;
  pinLabelCtx: ColorCtx | null;
  pinBorderCtx: ColorCtx | null;
  pinBorderWidthCtx: NumCtx | null;
  pinShapeCtx: PinShapeCtx | null;
  pinTailCtx: PinTailCtx | null;
  colorInputRef: RefObject<HTMLInputElement | null>;
  selected: boolean;
  lastBgColor: string;
  setLastBgColor: Dispatch<SetStateAction<string>>;
  stickerEntries: StickerEntry[];
  stickerSelection: StickerSelection;
  onSelectSticker: (sel: StickerSelection) => void;
  stickerPicker: boolean;
  numbering: {
    next: number;
    onChangeNext: (v: number) => void;
    onSave: () => void;
    onClear: () => void;
    onToggleContinuity: () => void;
    continuityOn: boolean;
    clearTo: number;
  } | null;
  reorder: {
    atFront: boolean;
    atBack: boolean;
    onReorder: (mode: ReorderMode) => void;
  } | null;
};

/** Routes the built control contexts to the matching per-tool panel and adds
 * the shared stacking-order footer for any selected annotation. All the
 * value/persistence logic lives in the ctx objects built by Toolbar; panels are
 * presentational. */
export function ToolOptionsPanel(p: ToolOptionsPanelProps) {
  let panel: React.ReactNode = null;
  switch (p.kind) {
    case "arrow":
      panel = (
        <ArrowPanel
          colorCtx={p.colorCtx}
          widthCtx={p.widthCtx}
          arrowHeadsCtx={p.arrowHeadsCtx}
          arrowDashCtx={p.arrowDashCtx}
          colorInputRef={p.colorInputRef}
          selected={p.selected}
        />
      );
      break;
    case "rect":
      panel = (
        <ShapesPanel
          colorCtx={p.colorCtx}
          widthCtx={p.widthCtx}
          cornerCtx={p.cornerCtx}
          rectShapeCtx={p.rectShapeCtx}
          colorInputRef={p.colorInputRef}
          selected={p.selected}
        />
      );
      break;
    case "pen":
      panel = (
        <PenPanel
          colorCtx={p.colorCtx}
          widthCtx={p.widthCtx}
          penLevelCtx={p.penLevelCtx}
          penModeCtx={p.penModeCtx}
          colorInputRef={p.colorInputRef}
          selected={p.selected}
        />
      );
      break;
    case "highlighter":
      panel = (
        <HighlighterPanel
          colorCtx={p.colorCtx}
          widthCtx={p.widthCtx}
          sizeCtx={p.sizeCtx}
          colorInputRef={p.colorInputRef}
          selected={p.selected}
        />
      );
      break;
    case "magnify":
      panel = (
        <MagnifyPanel
          colorCtx={p.colorCtx}
          widthCtx={p.widthCtx}
          cornerCtx={p.cornerCtx}
          penLevelCtx={p.penLevelCtx}
          sizeCtx={p.sizeCtx}
          magnifyShapeCtx={p.magnifyShapeCtx}
          magnifyLinkCtx={p.magnifyLinkCtx}
          arrowDashCtx={p.arrowDashCtx}
          colorInputRef={p.colorInputRef}
        />
      );
      break;
    case "text":
      panel = p.textStyleCtx ? (
        <TextPanel
          textStyleCtx={p.textStyleCtx}
          sizeCtx={p.sizeCtx}
          colorCtx={p.colorCtx}
          colorInputRef={p.colorInputRef}
          lastBgColor={p.lastBgColor}
          setLastBgColor={p.setLastBgColor}
        />
      ) : null;
      break;
    case "pin":
      panel = (
        <PinPanel
          colorCtx={p.colorCtx}
          sizeCtx={p.sizeCtx}
          pinLabelCtx={p.pinLabelCtx}
          pinBorderCtx={p.pinBorderCtx}
          pinBorderWidthCtx={p.pinBorderWidthCtx}
          pinShapeCtx={p.pinShapeCtx}
          pinTailCtx={p.pinTailCtx}
          colorInputRef={p.colorInputRef}
          selected={p.selected}
          numbering={p.numbering}
        />
      );
      break;
    case "sticker":
      panel = (
        <StickerPanel
          sizeCtx={p.sizeCtx}
          entries={p.stickerEntries}
          selection={p.stickerSelection}
          onSelect={p.onSelectSticker}
          showPicker={p.stickerPicker}
        />
      );
      break;
    case "blur":
      panel = <BlurPanel widthCtx={p.widthCtx} />;
      break;
    default:
      panel = null; // e.g. a selected image: only the reorder footer applies.
  }

  return (
    <div className="flex flex-col items-stretch gap-2.5">
      {panel}
      {p.reorder && (
        <>
          <div className="my-1 h-px w-full bg-[var(--border-strong)]" />
          <div className="flex items-center gap-0.5" role="group" aria-label="Stacking order">
            <ReorderButton Icon={SendToBack} title="Send to back" onClick={() => p.reorder!.onReorder("back")} disabled={p.reorder.atBack} />
            <ReorderButton Icon={ChevronsDown} title="Send backward" onClick={() => p.reorder!.onReorder("backward")} disabled={p.reorder.atBack} />
            <ReorderButton Icon={ChevronsUp} title="Bring forward" onClick={() => p.reorder!.onReorder("forward")} disabled={p.reorder.atFront} />
            <ReorderButton Icon={BringToFront} title="Bring to front" onClick={() => p.reorder!.onReorder("front")} disabled={p.reorder.atFront} />
          </div>
        </>
      )}
    </div>
  );
}
