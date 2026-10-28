import type { AppConfig } from "@/lib/config";
import type { Annotation } from "@/stores/editor";
import { arrowStrokeStyle } from "@/lib/strokeStyle";

/** The per-tool defaults an annotation implies, written to `lastUsed` when it
 *  is drawn or edited on the canvas. Each slot replaces the stored slot
 *  wholesale (scheduleLastUsedWrite), so every remembered field is included. */
export function lastUsedPatchForAnnotation(a: Annotation): NonNullable<AppConfig["lastUsed"]> {
  switch (a.type) {
    case "rect":
      return {
        rect: {
          strokeColor: a.stroke,
          strokeWidth: a.strokeWidth,
          shape: a.shape,
          cornerRadius: a.cornerRadius,
          strokeStyle: a.strokeStyle ?? "solid",
        },
      };
    case "arrow":
      // A headless line belongs to the Shapes tool — persist it under the rect
      // slot so it never writes heads:"none" into the Arrow defaults (which would
      // make subsequently-drawn arrows headless).
      if (a.heads === "none") {
        return {
          rect: {
            strokeColor: a.stroke,
            strokeWidth: a.strokeWidth,
            shape: "line",
            strokeStyle: arrowStrokeStyle(a),
          },
        };
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
          sourceStrokeWidth: a.sourceStrokeWidth,
          borderLinked: a.borderLinked,
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
          align: a.align,
          lineHeight: a.lineHeight,
        },
      };
    case "blur":
      return { blur: { blurRadius: a.blurRadius } };
    case "sticker":
      // Which sticker was picked (`stickerItem`) comes from the picker, not
      // the annotation — the editor adds it when placing one.
      return { sticker: { fontSize: a.fontSize } };
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
          labelStyle: a.labelStyle,
        },
      };
    case "image":
      // Layered images carry no persisted per-tool defaults.
      return {};
  }
}
