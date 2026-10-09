/**
 * Landing media manifest — the one place to swap or add pictures and clips.
 *
 * Hero clips: swap a clip by replacing its file in `public/landing/` (or editing
 * its line); add one by adding an entry (1–5 work — the hero re-splits its
 * scroll across them). Clips are 16:10 H.264 (1280×800 or larger) with a
 * keyframe every ~6 frames so scroll-scrubbing stays smooth; one source serves
 * every viewport. `duration` (s) weights the scroll before metadata loads.
 * `camera` drives the guided camera on narrow frames: `t` seconds into the
 * clip, `(x, y)` focus point as fractions of the frame, `s` zoom (1 = whole).
 *
 * Stills: set `ready: true` once `public/landing/<id>.webp` exists; until then
 * MediaSlot draws the designed placeholder. Shot briefs: docs/landing/SHOTS.md.
 */

import type { CameraKey } from "@/lib/heroCamera";
import type { TKey } from "@/i18n/store";

export type HeroClip = {
  id: string;
  label: TKey;
  caption: TKey;
  src: string;
  poster: string;
  duration: number;
  camera: CameraKey[];
};

export const HERO_CLIPS: HeroClip[] = [
  {
    id: "import",
    label: "site.clip.import",
    caption: "site.clip.import.caption",
    src: "/landing/hero-1-import.mp4",
    poster: "/landing/hero-1-import.jpg",
    duration: 1,
    camera: [{ t: 0, x: 0.5, y: 0.5, s: 1 }],
  },
  {
    id: "annotate",
    label: "site.clip.annotate",
    caption: "site.clip.annotate.caption",
    src: "/landing/hero-2-annotate.mp4",
    poster: "/landing/hero-2-annotate.jpg",
    duration: 8.8,
    camera: [
      { t: 0, x: 0.5, y: 0.5, s: 1 },
      { t: 0.6, x: 0.33, y: 0.53, s: 2.1 },
      { t: 7.7, x: 0.33, y: 0.53, s: 2.1 },
      { t: 8.6, x: 0.5, y: 0.5, s: 1 },
    ],
  },
  {
    id: "backdrop",
    label: "site.clip.backdrop",
    caption: "site.clip.backdrop.caption",
    src: "/landing/hero-3-backdrop.mp4",
    poster: "/landing/hero-3-backdrop.jpg",
    duration: 8.4,
    camera: [{ t: 0, x: 0.5, y: 0.5, s: 1 }],
  },
];

export type SlotId =
  | "hero-editor" | "full-screen" | "area-overlay" | "window-corners" | "ring-v2" | "scroll-capture"
  | "backdrop-base" | "thai-text" | "settings-th" | "ocr" | "tool-arrow" | "tool-pins" | "tool-magnify"
  | "tool-blur" | "workspaces" | "history-preview" | "paste-mobile";

export type Slot = {
  id: SlotId;
  /** One line saying what the real shot will show (placeholder copy). */
  line: TKey;
  /** CSS aspect-ratio of the shot. */
  aspect: string;
  /** Flip to true once public/landing/<id>.webp is in place. */
  ready: boolean;
  /** Editor tool shown active in the placeholder's chrome. */
  tool?: EditorTool;
  /** Clip instead of a still: public/landing/<id>.mp4 (looped, muted). */
  video?: boolean;
  /**
   * How a ready shot is framed: "window" = a capture of the whole editor,
   * shown in a plain window (it already has the real toolbar); "crop" = a
   * close-up of the canvas, shown as a bare card.
   */
  shot: "window" | "crop";
};

export type EditorTool = "select" | "arrow" | "shapes" | "text" | "blur" | "pen" | "highlighter" | "magnify" | "sticker" | "pin" | "crop";

type SlotOpts = { tool?: EditorTool; video?: boolean; ready?: boolean; shot?: Slot["shot"] };
const slot = (id: SlotId, aspect: string, o: SlotOpts = {}): Slot => ({
  id,
  line: `site.slot.${id}` as TKey,
  aspect,
  ready: o.ready ?? false,
  tool: o.tool ?? "select",
  video: o.video ?? false,
  shot: o.shot ?? "window",
});

// Ready shots were captured from the web editor (/paste, light theme) with
// Playwright; the rest need the desktop app (see docs/landing/SHOTS.md).
export const SLOTS: Record<SlotId, Slot> = {
  "hero-editor": slot("hero-editor", "16 / 10", { tool: "arrow", ready: true }),
  "full-screen": slot("full-screen", "16 / 10"),
  "area-overlay": slot("area-overlay", "16 / 10", { tool: "crop" }),
  "window-corners": slot("window-corners", "16 / 10"),
  "ring-v2": slot("ring-v2", "16 / 10", { video: true }),
  "scroll-capture": slot("scroll-capture", "16 / 10", { video: true }),
  "backdrop-base": slot("backdrop-base", "16 / 10", { ready: true }),
  "thai-text": slot("thai-text", "16 / 10", { tool: "text", ready: true }),
  "settings-th": slot("settings-th", "16 / 10"),
  ocr: slot("ocr", "16 / 10"),
  "tool-arrow": slot("tool-arrow", "7 / 5", { tool: "arrow", ready: true, shot: "crop" }),
  "tool-pins": slot("tool-pins", "1 / 1", { tool: "pin", ready: true, shot: "crop" }),
  "tool-magnify": slot("tool-magnify", "1 / 1", { tool: "magnify", ready: true, shot: "crop" }),
  "tool-blur": slot("tool-blur", "7 / 5", { tool: "blur", ready: true, shot: "crop" }),
  workspaces: slot("workspaces", "16 / 10", { video: true, ready: true }),
  "history-preview": slot("history-preview", "16 / 10"),
  "paste-mobile": slot("paste-mobile", "9 / 19.5", { ready: true }),
};
