import type {
  PinShapeKind,
  PinTailDir,
  RectShapeKind,
  FreehandMode,
  MagnifyShape,
  ArrowHeads,
  TextAlign,
} from "@/stores/editor";

/** Font style is a space-joined set of "bold"/"italic" (Konva convention). */
export type TextFontStyle = "normal" | "bold" | "italic" | "italic bold";
export type TextDecoration =
  | ""
  | "underline"
  | "line-through"
  | "underline line-through";

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
};

export type PinShapeCtx = { value: PinShapeKind; onChange: (v: PinShapeKind) => void };
export type PinTailCtx = { value: PinTailDir; onChange: (v: PinTailDir) => void };
export type RectShapeCtx = { value: RectShapeKind; onChange: (v: RectShapeKind) => void };
export type PenModeCtx = { value: FreehandMode; onChange: (v: FreehandMode) => void };
export type MagnifyShapeCtx = { value: MagnifyShape; onChange: (v: MagnifyShape) => void };
export type ArrowHeadsCtx = { value: ArrowHeads; onChange: (v: ArrowHeads) => void };
