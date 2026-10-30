import type { TKey } from "@/i18n/store";

/**
 * Built-in sticker sets (CP-0048).
 *
 * Image sets ship as 256 px WebP under `public/stickers/<set>/`, so they look
 * the same on every OS (unlike the emoji set, which uses the system emoji
 * font). The art was generated for capz (source: generated, owned by capz);
 * see `public/stickers/README.md`.
 *
 * Annotations store the image's site-relative path in `src`, not a data URL,
 * so saved workspaces and templates stay small. Item ids are therefore part of
 * the persisted format (`lastUsed.stickerItem`, annotation `src`): never
 * rename a file or an id, only add new ones.
 */

export type StickerItem =
  | { id: string; kind: "emoji"; char: string }
  | { id: string; kind: "image"; src: string; nameKey?: TKey; name?: string };

export type StickerSet = {
  /** Built-in: the set id. User folder: `dir:<hash>`. */
  id: string;
  source: "builtin" | "dir";
  /** Built-in sets are named by i18n key; folder sets by `name`. */
  nameKey?: TKey;
  name?: string;
  items: StickerItem[];
};

export const EMOJI_SET_ID = "emoji";

/** The original 10 emoji — kept as the "Emoji" set. Item id = the emoji. */
export const EMOJI_STICKERS = [
  "⭐",
  "❤️",
  "✅",
  "❌",
  "👍",
  "👎",
  "🔥",
  "💡",
  "⚠️",
  "🎯",
] as const;

// [set, [slug, ...]] — files are `<NN>-<slug>.webp`, NN = 1-based position.
const IMAGE_SETS = [
  [
    "pointers",
    [
      "curved-arrow",
      "arrow",
      "pointing-hand",
      "circle",
      "frame",
      "squiggle",
      "burst",
      "speech-bubble",
      "thought-bubble",
      "magnifier",
      "push-pin",
      "target",
    ],
  ],
  [
    "status",
    [
      "check",
      "cross",
      "warning",
      "info",
      "question",
      "bug",
      "cone",
      "hourglass",
      "lock",
      "rocket",
      "sparkles",
      "no-entry",
    ],
  ],
  [
    "reactions",
    [
      "thumbs-up",
      "thumbs-down",
      "heart",
      "fire",
      "eyes",
      "happy",
      "thinking",
      "mind-blown",
      "laughing",
      "facepalm",
      "party",
      "clap",
    ],
  ],
  [
    "cursors",
    [
      "cursor",
      "hand-cursor",
      "click",
      "double-click",
      "grab",
      "tap",
      "scroll",
      "key",
      "key-command",
      "key-shift",
      "key-return",
      "loading",
    ],
  ],
  [
    "craft",
    [
      "tape-green",
      "tape-red",
      "sticky-note",
      "paper-clip",
      "binder-clip",
      "paper-scrap",
      "marker",
      "tag",
      "pencil",
      "balloon",
      "bookmark",
      "envelope",
    ],
  ],
] as const;

export type BuiltinImageSetId = (typeof IMAGE_SETS)[number][0];

/** Site-relative URL of a built-in image sticker. Works in the Tauri webview
 * and on the web build (both serve `out/` at the origin root). */
export function builtinStickerSrc(setId: string, index: number, slug: string): string {
  return `/stickers/${setId}/${String(index + 1).padStart(2, "0")}-${slug}.webp`;
}

/** Built-in sets in their default order: emoji first (the pre-CP-0048 picker). */
export const BUILTIN_STICKER_SETS: readonly StickerSet[] = [
  {
    id: EMOJI_SET_ID,
    source: "builtin",
    nameKey: "stickers.set.emoji",
    items: EMOJI_STICKERS.map((char) => ({ id: char, kind: "emoji", char })),
  },
  ...IMAGE_SETS.map(([id, slugs]): StickerSet => ({
    id,
    source: "builtin",
    nameKey: `stickers.set.${id}` as TKey,
    items: slugs.map((slug, i) => ({
      id: slug,
      kind: "image",
      src: builtinStickerSrc(id, i, slug),
      nameKey: `stickers.${id}.${slug}` as TKey,
    })),
  })),
];

export const BUILTIN_STICKER_SET_IDS: readonly string[] = BUILTIN_STICKER_SETS.map((s) => s.id);
