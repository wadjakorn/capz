import type {
  PinLabelStyle,
  PinShapeKind,
  PinTailDir,
  RectShapeKind,
  StrokeStyle,
  FreehandMode,
  MagnifyShape,
  ArrowHeads,
  DimLevel,
  TextAlign,
  TextFontStyle,
  TextDecoration,
} from "@/stores/editor";

// The annotation store owns these; re-exported so panels and Toolbar can pull
// the whole control-context contract from one place without a second copy that
// could drift from the store's.
export type { TextFontStyle, TextDecoration };

/** A color control (swatch input). */
export type ColorCtx = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

/** A numeric control. The builder in Toolbar sets label/range/onChange; the
 * panel decides its preset chips + glyphs. */
export type NumCtx = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

/** A boolean toggle (dash on/off, border link, …). */
export type ToggleCtx = { value: boolean; onChange: (v: boolean) => void };

export type TextStyleCtx = {
  fontStyle: TextFontStyle;
  textDecoration: TextDecoration;
  fontFamily: string;
  backgroundColor: string | null;
  bgPadding: number;
  align: TextAlign;
  lineHeight: number;
  setFontStyle: (v: TextFontStyle) => void;
  setTextDecoration: (v: TextDecoration) => void;
  setFontFamily: (v: string) => void;
  setBackgroundColor: (v: string | null) => void;
  setBgPadding: (v: number) => void;
  setAlign: (v: TextAlign) => void;
  setLineHeight: (v: number) => void;
  /** Outline + shadow (CP-0106). Per-shape only, so present only while a
   *  text annotation is selected. */
  effects?: TextEffectsCtx;
};

export type TextEffectsCtx = {
  /** null = outline off. */
  outlineColor: string | null;
  outlineWidth: number;
  shadow: boolean;
  /** Turn the outline on (with the last colour picked) or off. */
  setOutlineOn: (on: boolean) => void;
  setOutlineColor: (v: string) => void;
  setOutlineWidth: (v: number) => void;
  setShadow: (on: boolean) => void;
};

export type PinShapeCtx = { value: PinShapeKind; onChange: (v: PinShapeKind) => void };
export type PinTailCtx = { value: PinTailDir; onChange: (v: PinTailDir) => void };
export type PinLabelStyleCtx = {
  value: PinLabelStyle;
  onChange: (v: PinLabelStyle) => void;
};
export type RectShapeCtx = {
  value: RectShapeKind;
  onChange: (v: RectShapeKind) => void;
  /** Shapes the selection cannot convert to (line ↔ box, CP-0102). */
  disabled?: readonly RectShapeKind[];
};
export type StrokeStyleCtx = { value: StrokeStyle; onChange: (v: StrokeStyle) => void };
export type PenModeCtx = { value: FreehandMode; onChange: (v: FreehandMode) => void };
export type MagnifyShapeCtx = { value: MagnifyShape; onChange: (v: MagnifyShape) => void };
export type ArrowHeadsCtx = { value: ArrowHeads; onChange: (v: ArrowHeads) => void };
/** Spotlight dim of a rect / ellipse (CP-0095): on/off plus the level, which
 *  is remembered while dim is off. */
export type DimCtx = {
  on: boolean;
  level: DimLevel;
  setOn: (v: boolean) => void;
  setLevel: (v: DimLevel) => void;
};
