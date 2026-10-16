import type { AppConfig } from "@/lib/config";
import {
  pickBackdropLook,
  type ApplyTarget,
  type BackdropLook,
  type EditTemplate,
  type TemplateSelection,
} from "@/lib/template";
import type { Annotation, ImageCrop } from "@/stores/editor";

export type PickerItem =
  | { kind: "crop"; crop: ImageCrop }
  | { kind: "backdropOn"; value: boolean }
  | { kind: "backdropLook"; look: BackdropLook }
  | {
      kind: "annotation";
      id: string;
      type: Annotation["type"];
      text?: string;
      pinNumber?: number;
      emoji?: string;
      swatch?: string;
      bytes?: number;
      w?: number;
      h?: number;
    };

/** Approximate decoded size of a data URL; other URLs report 0. */
function srcBytes(src: string): number {
  const i = src.indexOf("base64,");
  return i < 0 ? 0 : Math.floor(((src.length - i - 7) * 3) / 4);
}

function annotationItem(a: Annotation): PickerItem {
  const base = { kind: "annotation" as const, id: a.id, type: a.type };
  switch (a.type) {
    case "text":
      return { ...base, text: a.text, swatch: a.fill };
    case "pin":
      return { ...base, pinNumber: a.number, swatch: a.color };
    case "sticker":
      return { ...base, emoji: a.kind === "image" ? undefined : a.char, text: a.name };
    case "image":
      return { ...base, w: a.w, h: a.h, bytes: srcBytes(a.src) };
    case "blur":
      return base;
    default:
      return { ...base, swatch: a.stroke };
  }
}

function annotationItems(list: readonly Annotation[]): PickerItem[] {
  // Topmost (last in render order) first.
  return [...list].reverse().map(annotationItem);
}

export function itemsFromDoc(
  doc: ApplyTarget,
  backdrop: AppConfig["general"]["backdrop"],
): PickerItem[] {
  const items: PickerItem[] = [];
  if (doc.imageCrop) items.push({ kind: "crop", crop: { ...doc.imageCrop } });
  items.push({ kind: "backdropOn", value: doc.backdropOn });
  items.push({ kind: "backdropLook", look: pickBackdropLook(backdrop) });
  return [...items, ...annotationItems(doc.annotations)];
}

export function itemsFromTemplate(tpl: EditTemplate): PickerItem[] {
  const items: PickerItem[] = [];
  if (tpl.crop) items.push({ kind: "crop", crop: { ...tpl.crop } });
  if (tpl.backdropOn !== undefined) items.push({ kind: "backdropOn", value: tpl.backdropOn });
  if (tpl.backdropLook) items.push({ kind: "backdropLook", look: tpl.backdropLook });
  return [...items, ...annotationItems(tpl.annotations)];
}

/** Everything checked except the backdrop look, which is always opt-in. */
export function defaultSelection(items: PickerItem[]): TemplateSelection {
  return {
    crop: items.some((i) => i.kind === "crop"),
    backdropOn: items.some((i) => i.kind === "backdropOn"),
    backdropLook: false,
    annotationIds: new Set(
      items.flatMap((i) => (i.kind === "annotation" ? [i.id] : [])),
    ),
  };
}
