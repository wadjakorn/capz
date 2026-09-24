import type {
  PinShapeKind,
  PinLabelStyle,
  PinTailDir,
  RectShapeKind,
  FreehandMode,
  MagnifyShape,
  ArrowHeads,
  TextAlign,
} from "@/stores/editor";
import { validateAccelerator } from "@/lib/shortcuts";
import {
  RING_MAX_MODES,
  RING_MIN_MODES,
  RING_MODE_IDS,
  RING_WEDGES,
  type RingWedge,
} from "@/lib/commandRing";

/** Thai-aware sans stack (mirrors OcrLayer's FONT_STACK) — leads with
 * "Noto Sans Thai" so Thai glyphs render cleanly, falling back to the system
 * sans for everything else. Default family for the text tool. */
export const THAI_SANS_STACK =
  '"Noto Sans Thai", system-ui, -apple-system, sans-serif';
/** Default line-height multiplier for text annotations — roomy enough that Thai
 * above/below marks don't collide across lines. */
export const DEFAULT_TEXT_LINE_HEIGHT = 1.35;

export type Tool =
  | "select"
  | "arrow"
  | "rect"
  | "text"
  | "blur"
  | "pen"
  | "highlighter"
  | "magnify"
  | "sticker"
  | "pin";

/** Tools that can stay selected after each use (Select and Crop never can). */
export type StickyCapableTool = Exclude<Tool, "select">;
/** Per-tool sticky flags; a missing key means sticky. */
export type KeepToolActive = Record<StickyCapableTool, boolean>;

export type AppConfig = {
  schemaVersion: number;
  hotkeys: {
    captureFull: string;
    captureArea: string;
    captureWindow: string;
    /** Scrolling capture — may be "" (unbound; no default key). */
    captureScroll: string;
    /**
     * System area capture via macOS `screencapture -i` — macOS-only, may be ""
     * (unbound; no default key). Ignored by the Rust side off macOS.
     */
    captureSystemArea: string;
    showEditor: string;
    /** Command ring v1 — click-to-pick. Press once; the ring takes focus. */
    commandRing: string;
    /**
     * Command ring v2 — alt+tab-style hold/cycle/release (CP-0038). Kept
     * deliberately separate from `commandRing`: the two rings coexist and the
     * user may bind one, both, or neither. Ships unbound ("").
     */
    commandRingV2: string;
  };
  ring: {
    /**
     * Capture modes occupying the v2 ring's slots, clockwise from the top.
     * 1–4 entries (`RING_MIN_MODES`..`RING_MAX_MODES`); v2 cycles through them
     * in this order.
     */
    modes: RingWedge[];
  };
  output: {
    defaultMode: "file" | "clipboard" | "both";
    fileFormat: "png" | "jpeg" | "webp";
    jpegQuality: number;
    defaultSavePath: string | null;
    filenameTemplate: string;
  };
  pins: {
    continuityMode: "reset" | "continue";
    lastUsedNumber: number;
    defaultStartNumber: number;
    defaultColor: string;
    defaultSize: number;
    defaultLabelColor: string;
    defaultBorderColor: string;
    defaultBorderWidth: number;
    defaultShape: PinShapeKind;
    defaultBubbleTail: PinTailDir;
    defaultLabelStyle: PinLabelStyle;
  };
  /**
   * Multiple editing workspaces (CP-0045). Off by default: with one workspace
   * the app behaves exactly as it always has, and the bottom bar never renders.
   */
  workspaces: {
    enabled: boolean;
    /** How many workspaces may exist at once. Clamped to WORKSPACE_MAX_RANGE. */
    max: number;
    /**
     * What an incoming capture does while `enabled`:
     *  - "new"     → push a new workspace (evicting the oldest at `max`)
     *  - "replace" → overwrite the active workspace, count stays fixed
     * Both are undoable via the toast; "replace" is the opt-out for users who
     * never want a workspace closed behind their back.
     */
    onCapture: "new" | "replace";
  };
  /**
   * Capture history (CP-0045) — a list of files this app has written to disk.
   * Desktop only: the web build has no path for a downloaded file, so nothing
   * here is meaningful there.
   */
  history: {
    enabled: boolean;
    /** FIFO cap on remembered entries. Trimming a record never touches the file. */
    max: number;
    viewMode: "list" | "grid";
    /**
     * Copy every screen capture into `<saveDir>/Captures/` as it arrives, so a
     * capture you never got round to exporting is still recoverable.
     * Independent of `max`, which only ever bounded the list of SAVED files.
     */
    archiveCaptures: boolean;
    /**
     * Size ceiling for that folder, in MB. A byte budget rather than a row
     * count: one full-screen retina PNG is 10-20MB, so "200 captures" says
     * nothing useful about how much disk this costs.
     */
    archiveBudgetMb: number;
  };
  general: {
    theme: "light" | "dark" | "system";
    autostart: boolean;
    playSoundOnCapture: boolean;
    rememberLastTool: boolean;
    /**
     * Per-tool: does the tool stay selected after each use, instead of
     * snapping back to Select? Keyed by every tool that can be sticky
     * (select/crop never are, so they have no key).
     */
    keepToolActive: KeepToolActive;
    onboardingCompleted: boolean;
    alwaysOnTopEditor: boolean;
    closeAction: "none" | "copy" | "file" | "both";
    editorWindow: { width: number; height: number };
    showRulers: boolean;
    snapEnabled: boolean;
    canvasBackground: string;
    /**
     * App version whose settings the user has already been shown. Anything
     * added in a later version wears a "New" badge until its page is opened.
     * Empty on a fresh install, which is then treated as "seen".
     */
    lastSeenSettingsVersion: string;
    /** Ids of one-off setting suggestions the user dismissed. */
    dismissedSuggestions: string[];
    /** Optional padded gradient/solid backdrop behind the capture. */
    backdrop: {
      style: "gradient" | "solid";
      /** Gradient preset id (see lib/backdrop GRADIENT_PRESETS). */
      presetId: string;
      /** Solid-style background color. */
      solidColor: string;
      /** Uniform padding around the capture, logical px. */
      padding: number;
      /** Corner radius applied to the floated capture, px. */
      cornerRadius: number;
      /** Drop shadow under the floated capture. */
      shadow: boolean;
      /** Auto-enable the backdrop for full-screen captures. */
      autoForFull: boolean;
      /** Auto-enable the backdrop for area captures. */
      autoForArea: boolean;
      /** Auto-enable the backdrop for window captures. */
      autoForWindow: boolean;
    };
  };
  lastUsed?: {
    tool?: Tool;
    stickerEmoji?: string;
    region?: { monitorId: number; x: number; y: number; w: number; h: number };
    lastCaptureKind?: "full" | "area" | "window";
    /** Remembered kind for the capture-as-layer split button. Deliberately
     * separate from `lastCaptureKind` so the two toolbar buttons do not
     * overwrite each other's default. */
    lastLayerCaptureKind?: "full" | "area" | "window";
    lastExportAction?: "copy" | "file" | "both";
    rect?: {
      strokeColor?: string;
      strokeWidth?: number;
      shape?: RectShapeKind;
      cornerRadius?: number;
    };
    arrow?: {
      strokeColor?: string;
      strokeWidth?: number;
      heads?: ArrowHeads;
      dash?: boolean;
    };
    pen?: {
      strokeColor?: string;
      strokeWidth?: number;
      mode?: FreehandMode;
      polygonEpsilon?: number;
      curveSmoothing?: number;
    };
    highlighter?: { strokeColor?: string; strokeWidth?: number; opacity?: number };
    magnify?: {
      strokeColor?: string;
      strokeWidth?: number;
      sourceStrokeWidth?: number;
      borderLinked?: boolean;
      shape?: MagnifyShape;
      zoom?: number;
      areaOpacity?: number;
      linkDash?: boolean;
    };
    text?: {
      color?: string;
      fontSize?: number;
      fontStyle?: "normal" | "bold" | "italic" | "italic bold";
      textDecoration?: "" | "underline" | "line-through" | "underline line-through";
      fontFamily?: string;
      backgroundColor?: string | null;
      backgroundPadding?: number;
      align?: TextAlign;
      lineHeight?: number;
    };
    blur?: { blurRadius?: number };
    sticker?: { fontSize?: number };
    pin?: {
      color?: string;
      size?: number;
      labelColor?: string;
      borderColor?: string;
      borderWidth?: number;
      shape?: PinShapeKind;
      bubbleTail?: PinTailDir;
      labelStyle?: PinLabelStyle;
    };
  };
  tools: {
    rect: {
      strokeColor: string;
      strokeWidth: number;
      shape: RectShapeKind;
      cornerRadius: number;
    };
    arrow: {
      strokeColor: string;
      strokeWidth: number;
      heads: ArrowHeads;
      dash: boolean;
    };
    text: {
      fontSize: number;
      color: string;
      fontStyle: "normal" | "bold" | "italic" | "italic bold";
      textDecoration: "" | "underline" | "line-through" | "underline line-through";
      fontFamily: string;
      backgroundColor: string | null;
      backgroundPadding: number;
      align: TextAlign;
      lineHeight: number;
    };
    blur: { blurRadius: number };
    pen: {
      strokeColor: string;
      strokeWidth: number;
      mode: FreehandMode;
      polygonEpsilon: number;
      curveSmoothing: number;
    };
    highlighter: { strokeColor: string; strokeWidth: number; opacity: number };
    magnify: {
      strokeColor: string;
      strokeWidth: number;
      sourceStrokeWidth: number;
      borderLinked: boolean;
      shape: MagnifyShape;
      zoom: number;
      areaOpacity: number;
      linkDash: boolean;
    };
    sticker: { fontSize: number };
  };
  capture: {
    intermediateFormat: "png" | "jpeg";
    intermediateMaxEdge: number | null;
    tempJpegQuality: number;
  };
  updates: {
    autoCheck: boolean;
    /**
     * Opt-in: send a random install id with the update check so active
     * installs can be counted. Off by default (SignPath privacy terms).
     */
    shareInstallId: boolean;
    checkIntervalHours: number;
    channel: "stable" | "beta";
    skippedVersion: string | null;
    lastCheckedAt: number | null;
  };
  stickers: {
    directory: string | null;
  };
};

// v2 (CP-0038): added `hotkeys.commandRingV2` and the `ring` section.
export const CONFIG_SCHEMA_VERSION = 2;

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  hotkeys: {
    captureFull: "CmdOrCtrl+Alt+Shift+3",
    captureArea: "CmdOrCtrl+Alt+Shift+4",
    captureWindow: "CmdOrCtrl+Alt+Shift+5",
    captureScroll: "",
    captureSystemArea: "",
    showEditor: "CmdOrCtrl+Alt+Shift+0",
    commandRing: "CmdOrCtrl+Shift+Space",
    // v2 ships unbound: it would otherwise collide with v1's default, and the
    // hold gesture is opt-in. Same "" contract as scroll (CP-0036).
    commandRingV2: "",
  },
  ring: {
    // The v1 wedge order, so a user who binds v2 sees the ring they already know.
    modes: [...RING_WEDGES],
  },
  output: {
    defaultMode: "clipboard",
    fileFormat: "jpeg",
    jpegQuality: 80,
    defaultSavePath: null,
    filenameTemplate: "capz-{yyyy}{MM}{dd}-{HHmmss}",
  },
  pins: {
    continuityMode: "continue",
    lastUsedNumber: 0,
    defaultStartNumber: 1,
    defaultColor: "#E5342B",
    defaultSize: 36,
    defaultLabelColor: "#ffffff",
    defaultBorderColor: "#ffffff",
    defaultBorderWidth: 2,
    defaultShape: "circle",
    defaultBubbleTail: "down",
    defaultLabelStyle: "numeric",
  },
  workspaces: {
    enabled: false,
    max: 5,
    onCapture: "new",
  },
  history: {
    enabled: false,
    max: 50,
    viewMode: "list",
    archiveCaptures: false,
    archiveBudgetMb: 500,
  },
  general: {
    theme: "dark",
    autostart: false,
    playSoundOnCapture: false,
    rememberLastTool: true,
    keepToolActive: {
      rect: true,
      arrow: true,
      text: true,
      blur: true,
      magnify: true,
      sticker: true,
      pen: true,
      highlighter: true,
      pin: true,
    },
    onboardingCompleted: false,
    alwaysOnTopEditor: false,
    closeAction: "copy",
    editorWindow: { width: 1024, height: 680 },
    showRulers: false,
    snapEnabled: true,
    canvasBackground: "#ffffff",
    lastSeenSettingsVersion: "",
    dismissedSuggestions: [],
    backdrop: {
      style: "gradient",
      presetId: "slate",
      solidColor: "#1b1f2a",
      padding: 64,
      cornerRadius: 12,
      shadow: true,
      autoForFull: false,
      autoForArea: false,
      autoForWindow: true,
    },
  },
  tools: {
    rect: {
      strokeColor: "#ef4444",
      strokeWidth: 3,
      shape: "rect",
      cornerRadius: 8,
    },
    arrow: { strokeColor: "#ef4444", strokeWidth: 4, heads: "end", dash: false },
    text: {
      fontSize: 24,
      color: "#000000",
      fontStyle: "normal",
      textDecoration: "",
      fontFamily: THAI_SANS_STACK,
      backgroundColor: "#ffffff",
      backgroundPadding: 14,
      align: "left",
      lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
    },
    blur: { blurRadius: 16 },
    pen: {
      strokeColor: "#ef4444",
      strokeWidth: 4,
      mode: "raw",
      polygonEpsilon: 8,
      curveSmoothing: 6,
    },
    highlighter: { strokeColor: "#facc15", strokeWidth: 28, opacity: 0.5 },
    magnify: {
      strokeColor: "#facc15",
      strokeWidth: 3,
      sourceStrokeWidth: 2,
      borderLinked: true,
      shape: "circle",
      zoom: 2,
      areaOpacity: 0.15,
      linkDash: true,
    },
    sticker: { fontSize: 48 },
  },
  capture: {
    intermediateFormat: "png",
    intermediateMaxEdge: null,
    tempJpegQuality: 85,
  },
  updates: {
    autoCheck: true,
    shareInstallId: false,
    checkIntervalHours: 24,
    channel: "stable",
    skippedVersion: null,
    lastCheckedAt: null,
  },
  stickers: {
    directory: null,
  },
};

export const CONFIG_STORE_FILE = "config.json";
export const CONFIG_STORE_KEY = "app";

/** Separate store file holding the persisted config as it was before any
 * migration / self-heal rewrite (CP-0055). For support and manual recovery. */
export const CONFIG_BACKUP_STORE_FILE = "config.backup.json";

// ---------------------------------------------------------------------------
// Schema migrations (CP-0055).
//
// CONFIG_MIGRATIONS[n] turns a v`n` object into a v`n+1` object. migrateConfig
// runs every step from the stored version up to CONFIG_SCHEMA_VERSION, so a
// user who skipped releases still gets each transform in order. Bumping
// CONFIG_SCHEMA_VERSION without adding the step throws at import time
// (assertMigrationChain), which fails `pnpm test:unit`.
//
// A step must carry the user's value across when it renames, moves or retypes
// a key — never leave it to fall back to the default.
//
// ANY change to what is persisted needs a bump — adding a key or an enum
// value included, even though validation would absorb it (use an identity
// step). Downgrade protection keys off schemaVersion: an older build treats a
// same-version store as its own, so it strips keys it doesn't know and resets
// enum values it doesn't know on its next write. Bumping makes it see the
// store as newer and leave those alone. config.shape.test.ts enforces it:
// it pins DEFAULT_CONFIG's keys plus every validated leaf (lastUsed included)
// and its enum values (persistedShape()) to shape.v<N>.json.
//
// Rust reads these paths straight from config.json at startup, BEFORE the
// webview has migrated the file (first launch after an update). A step that
// renames or moves one of them must update the Rust reader too, or make it
// accept both the old and the new path:
//   hotkeys.*                                  src-tauri/src/shortcuts.rs
//   updates.autoCheck, updates.checkIntervalHours  src-tauri/src/lib.rs
//   general.onboardingCompleted                src-tauri/src/lib.rs
//   general.editorWindow.{width,height}        src-tauri/src/windows.rs
//   general.alwaysOnTopEditor                  src-tauri/src/windows.rs
//   lastUsed.region.monitorId                  src-tauri/src/windows.rs
// ---------------------------------------------------------------------------

type ConfigObject = Record<string, unknown>;
export type ConfigMigration = (o: ConfigObject) => ConfigObject;

export const CONFIG_MIGRATIONS: Record<number, ConfigMigration> = {
  // v0 → v1: stores written before v0.5.1 carry no schemaVersion. The shape is
  // otherwise the same; keys added since fall back to their defaults.
  0: (o) => o,
  // v1 → v2 (CP-0038): only ADDED keys (`hotkeys.commandRingV2`, `ring`), and
  // absent keys already fall back to their defaults in vsec/vRing.
  1: (o) => o,
};

/** Throws when a version between 0 and `version - 1` has no migration step. */
export function assertMigrationChain(
  migrations: Record<number, ConfigMigration>,
  version: number,
): void {
  for (let v = 0; v < version; v++) {
    if (typeof migrations[v] !== "function") {
      throw new Error(
        `config: no migration from schemaVersion ${v} to ${v + 1}; add CONFIG_MIGRATIONS[${v}]`,
      );
    }
  }
}
assertMigrationChain(CONFIG_MIGRATIONS, CONFIG_SCHEMA_VERSION);

export type MigratedConfig = {
  /** The migrated object, or undefined when nothing usable was persisted. */
  value: ConfigObject | undefined;
  /** schemaVersion found on disk (0 when absent). */
  fromVersion: number;
  /** Written by a newer capz than this build. Returned untouched: this build
   * must not rewrite it into its own (older) shape. */
  future: boolean;
};

/** Is `v` a plain object (not an array / null)? */
export function isPlainObject(v: unknown): v is ConfigObject {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Recursive merge: plain objects merge key by key, anything else (arrays,
 * primitives, null) in `patch` replaces the value in `base`. Returns a new
 * object; neither input is mutated. An `undefined` in `patch` is kept as an
 * `undefined` value, which JSON serialization then drops — i.e. it deletes
 * the key on disk. That is intended: it matches what writing the full config
 * does with an `undefined` field. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: ConfigObject = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = deepMerge(base[k], v);
  }
  return out;
}

// Forward-compatible migration entry point. Transforms `raw` to the latest
// shape before validateConfig() fills in defaults. Never mutates `raw`.
export function migrateConfig(
  raw: unknown,
  migrations: Record<number, ConfigMigration> = CONFIG_MIGRATIONS,
  version: number = CONFIG_SCHEMA_VERSION,
): MigratedConfig {
  if (!isPlainObject(raw)) return { value: undefined, fromVersion: 0, future: false };
  let obj = structuredClone(raw);
  // A corrupt (non-integer / negative) version is treated like a missing one.
  const sv = obj.schemaVersion;
  const v = typeof sv === "number" && Number.isInteger(sv) && sv >= 0 ? sv : 0;
  if (v > version) {
    console.warn(
      `config schemaVersion ${v} newer than supported ${version}; keeping unknown settings`,
    );
    return { value: obj, fromVersion: v, future: true };
  }
  for (let step = v; step < version; step++) {
    obj = migrations[step](obj);
    obj.schemaVersion = step + 1;
  }
  // Retired in the area-capture revamp: region persistence is now unconditional,
  // so `general.rememberLastRegion` no longer exists. Strip it here so upgraded
  // stores validate cleanly instead of tripping the unknown-key warning.
  if (isPlainObject(obj.general)) {
    delete obj.general.rememberLastRegion;
  }
  return { value: obj, fromVersion: v, future: false };
}

// ---------------------------------------------------------------------------
// Field-by-field config validation.
//
// Goal: a corrupt or partially-invalid persisted config must NOT wipe the whole
// thing back to defaults. Each leaf is validated independently — valid values
// are kept, invalid/wrong-typed ones are warned about and replaced with that
// single field's default. Always returns a fully-valid AppConfig.
// ---------------------------------------------------------------------------

type Validator = (v: unknown) => boolean;
const isStr: Validator = (v) => typeof v === "string";
const isBool: Validator = (v) => typeof v === "boolean";
const isNum: Validator = (v) => typeof v === "number" && Number.isFinite(v);
// Strictly positive — used where a zero/negative would break layout math (a
// corrupted persisted lineHeight of 0 collapses the text box and line spacing).
const isPosNum: Validator = (v) =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const isStrOrNull: Validator = (v) => v === null || typeof v === "string";
// An empty string means "unbound" and is allowed for every hotkey — any of
// them can be cleared from Settings.
const isValidOrEmptyAccelerator: Validator = (v) =>
  v === "" || (typeof v === "string" && validateAccelerator(v).ok);
const isNumOrNull: Validator = (v) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
type SetValidator = Validator & { options: readonly unknown[] };
const inSet = (...opts: unknown[]): SetValidator =>
  Object.assign((v: unknown) => opts.includes(v), { options: opts });

// Shape recorder for the schema guard (config.shape.test.ts). While
// persistedShape() runs, every validated leaf path is recorded along with its
// allowed enum values (null when it is not an enum). A no-op otherwise.
let shapeCollector: Map<string, readonly unknown[] | null> | null = null;
function recordLeaf(path: string, spec: Validator | undefined) {
  if (!shapeCollector || !spec) return;
  const options = (spec as Partial<SetValidator>).options;
  shapeCollector.set(path, options ? [...options] : null);
}

/**
 * Selectable workspace counts. A hand-edited store holding 1 would make the
 * feature meaningless (the bar hides at one workspace) and a huge number would
 * pin N full-resolution PNGs in the app data dir, so the range is enforced on
 * read rather than only in the Settings dropdown.
 */
export const WORKSPACE_MAX_RANGE = { min: 2, max: 9 } as const;
const isWorkspaceMax: Validator = (v) =>
  typeof v === "number" &&
  Number.isInteger(v) &&
  v >= WORKSPACE_MAX_RANGE.min &&
  v <= WORKSPACE_MAX_RANGE.max;

/** Offered history sizes. Anything else on disk falls back to the default. */
export const HISTORY_MAX_OPTIONS = [20, 50, 100, 200] as const;
const isHistoryMax: Validator = (v) =>
  typeof v === "number" && (HISTORY_MAX_OPTIONS as readonly number[]).includes(v);

/**
 * Offered archive budgets, MB. Enforced on read as well as in the dropdown: a
 * hand-edited store could otherwise name a budget that deletes the folder on
 * sight (0) or never evicts at all.
 */
export const ARCHIVE_BUDGET_OPTIONS_MB = [250, 500, 1024, 2048] as const;
const isArchiveBudget: Validator = (v) =>
  typeof v === "number" &&
  (ARCHIVE_BUDGET_OPTIONS_MB as readonly number[]).includes(v);

/**
 * Validate the `ring` section (CP-0038).
 *
 * Not `vsec`-able: `modes` is an array with cross-element rules (known values,
 * no duplicates, 1–4 entries) rather than an independent leaf.
 *
 * Enforcement happens HERE as well as in the Settings UI on purpose. The store
 * is a plain JSON file a user can hand-edit, and a config written by a future
 * build may legitimately contain modes this build has never heard of. Clamping
 * on read means the ring can never end up empty (nothing to cycle, nothing to
 * fire) or over-full (slots with no wedge to draw them in).
 *
 * Recovery is partial, not all-or-nothing: valid entries survive and only the
 * bad ones are dropped, so an unknown mode from a newer build costs the user
 * one slot instead of their whole ring layout.
 */
function vRing(raw: unknown, def: AppConfig["ring"], issues: string[]): AppConfig["ring"] {
  recordLeaf("ring.modes", inSet(...RING_MODE_IDS));
  if (raw === undefined) return { modes: [...def.modes] };
  if (!raw || typeof raw !== "object") {
    note(issues, "invalid ring (not an object), using defaults");
    return { modes: [...def.modes] };
  }
  const obj = raw as Record<string, unknown>;
  warnUnknownKeys("ring", obj, Object.keys(def), issues);
  if (!("modes" in obj)) return { modes: [...def.modes] };
  if (!Array.isArray(obj.modes)) {
    note(issues, "invalid ring.modes (not an array), using defaults");
    return { modes: [...def.modes] };
  }
  const seen = new Set<string>();
  const modes: RingWedge[] = [];
  for (const m of obj.modes) {
    if (typeof m !== "string" || !RING_MODE_IDS.includes(m as RingWedge)) {
      note(issues, `unknown ring.modes entry ${JSON.stringify(m)}, ignoring`);
      continue;
    }
    if (seen.has(m)) {
      note(issues, `duplicate ring.modes entry ${m}, ignoring`);
      continue;
    }
    seen.add(m);
    modes.push(m as RingWedge);
  }
  if (modes.length > RING_MAX_MODES) {
    note(issues, `ring.modes has more than ${RING_MAX_MODES} entries, truncating`);
    modes.length = RING_MAX_MODES;
  }
  if (modes.length < RING_MIN_MODES) {
    note(issues, `ring.modes needs at least ${RING_MIN_MODES} entry, using defaults`);
    return { modes: [...def.modes] };
  }
  return { modes };
}

/** Record a validation problem: collect for the UI and mirror to the console. */
function note(issues: string[], msg: string) {
  issues.push(msg);
  console.warn(`config: ${msg}`);
}

/** Warn about keys present in the persisted object but absent from the schema. */
function warnUnknownKeys(
  path: string,
  obj: Record<string, unknown>,
  allowed: readonly string[],
  issues: string[],
) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      note(issues, `unknown key ${path}.${key}, ignoring`);
    }
  }
}

/** Validate a flat section: copy each known leaf if valid, else warn + default. */
function vsec<T extends Record<string, unknown>>(
  path: string,
  raw: unknown,
  def: T,
  specs: { [K in keyof T]?: Validator },
  issues: string[],
): T {
  const out = { ...def };
  for (const key of Object.keys(def)) recordLeaf(`${path}.${key}`, specs[key]);
  if (raw === undefined) return out;
  if (!raw || typeof raw !== "object") {
    note(issues, `invalid ${path} (not an object), using defaults`);
    return out;
  }
  const obj = raw as Record<string, unknown>;
  warnUnknownKeys(path, obj, Object.keys(def), issues);
  for (const key of Object.keys(def) as (keyof T & string)[]) {
    if (!(key in obj)) continue; // missing → keep default silently
    const spec = specs[key];
    if (!spec) continue; // no validator → nested key handled by the caller
    const val = obj[key];
    if (spec(val)) {
      (out as Record<string, unknown>)[key] = val;
    } else {
      note(issues, `invalid ${path}.${key}, using default`);
    }
  }
  return out;
}

function vGeneral(
  raw: unknown,
  def: AppConfig["general"],
  issues: string[],
): AppConfig["general"] {
  const flat = vsec(
    "general",
    raw,
    def,
    {
      theme: inSet("light", "dark", "system"),
      autostart: isBool,
      playSoundOnCapture: isBool,
      rememberLastTool: isBool,
      onboardingCompleted: isBool,
      alwaysOnTopEditor: isBool,
      closeAction: inSet("none", "copy", "file", "both"),
      showRulers: isBool,
      snapEnabled: isBool,
      canvasBackground: isStr,
      lastSeenSettingsVersion: isStr,
    },
    issues,
  );
  const dsRaw =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).dismissedSuggestions
      : undefined;
  // Optional and additive: a config written by an older build simply has no
  // key here, which is why no schema bump is needed.
  flat.dismissedSuggestions =
    Array.isArray(dsRaw) && dsRaw.every((v) => typeof v === "string")
      ? (dsRaw as string[])
      : def.dismissedSuggestions;
  const ktaDef = def.keepToolActive;
  const keepToolActive = vsec(
    "general.keepToolActive",
    (raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).keepToolActive
      : undefined),
    ktaDef,
    Object.fromEntries(Object.keys(ktaDef).map((k) => [k, isBool])) as {
      [K in keyof KeepToolActive]?: Validator;
    },
    issues,
  );
  flat.keepToolActive = keepToolActive;
  const ewRaw =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).editorWindow
      : undefined;
  flat.editorWindow = vsec(
    "general.editorWindow",
    ewRaw,
    def.editorWindow,
    { width: isNum, height: isNum },
    issues,
  );
  const bdRaw =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).backdrop
      : undefined;
  flat.backdrop = vsec(
    "general.backdrop",
    bdRaw,
    def.backdrop,
    {
      style: inSet("gradient", "solid"),
      presetId: isStr,
      solidColor: isStr,
      padding: isNum,
      cornerRadius: isNum,
      shadow: isBool,
      autoForFull: isBool,
      autoForArea: isBool,
      autoForWindow: isBool,
    },
    issues,
  );
  return flat;
}

function vTools(
  raw: unknown,
  def: AppConfig["tools"],
  issues: string[],
): AppConfig["tools"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (raw && typeof raw === "object")
    warnUnknownKeys("tools", r, Object.keys(def), issues);
  return {
    rect: vsec("tools.rect", r.rect, def.rect, {
      strokeColor: isStr,
      strokeWidth: isNum,
      shape: inSet("rect", "ellipse", "line", "dashline"),
      cornerRadius: isNum,
    }, issues),
    arrow: vsec("tools.arrow", r.arrow, def.arrow, {
      strokeColor: isStr,
      strokeWidth: isNum,
      heads: inSet("end", "both", "none"),
      dash: isBool,
    }, issues),
    pen: vsec("tools.pen", r.pen, def.pen, {
      strokeColor: isStr,
      strokeWidth: isNum,
      mode: inSet("raw", "polygon", "curve"),
      polygonEpsilon: isNum,
      curveSmoothing: isNum,
    }, issues),
    highlighter: vsec("tools.highlighter", r.highlighter, def.highlighter, {
      strokeColor: isStr,
      strokeWidth: isNum,
      opacity: isNum,
    }, issues),
    magnify: vsec("tools.magnify", r.magnify, def.magnify, {
      strokeColor: isStr,
      strokeWidth: isNum,
      sourceStrokeWidth: isNum,
      borderLinked: isBool,
      shape: inSet("circle", "rect"),
      zoom: isNum,
      areaOpacity: isNum,
      linkDash: isBool,
    }, issues),
    text: vsec("tools.text", r.text, def.text, {
      fontSize: isNum,
      color: isStr,
      fontStyle: inSet("normal", "bold", "italic", "italic bold"),
      textDecoration: inSet("", "underline", "line-through", "underline line-through"),
      fontFamily: isStr,
      backgroundColor: isStrOrNull,
      backgroundPadding: isNum,
      align: inSet("left", "center", "right"),
      lineHeight: isPosNum,
    }, issues),
    blur: vsec("tools.blur", r.blur, def.blur, { blurRadius: isNum }, issues),
    sticker: vsec("tools.sticker", r.sticker, def.sticker, { fontSize: isNum }, issues),
  };
}

/** lastUsed is non-critical (drives "remember last tool"); validate leniently,
 * dropping only the sub-fields that are malformed. */
function vLastUsed(raw: unknown): AppConfig["lastUsed"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: NonNullable<AppConfig["lastUsed"]> = {};
  const scalars: Record<string, Validator> = {
    tool: inSet(
      "select",
      "arrow",
      "rect",
      "text",
      "blur",
      "pen",
      "highlighter",
      "magnify",
      "sticker",
      "pin",
    ),
    stickerEmoji: isStr,
    lastCaptureKind: inSet("full", "area", "window"),
    lastLayerCaptureKind: inSet("full", "area", "window"),
    lastExportAction: inSet("copy", "file", "both"),
  };
  for (const [k, ok] of Object.entries(scalars)) {
    recordLeaf(`lastUsed.${k}`, ok);
    if (ok(o[k])) (out as Record<string, unknown>)[k] = o[k];
  }
  for (const k of ["monitorId", "x", "y", "w", "h"]) recordLeaf(`lastUsed.region.${k}`, isNum);
  const reg = o.region;
  if (reg && typeof reg === "object") {
    const rr = reg as Record<string, unknown>;
    if ([rr.monitorId, rr.x, rr.y, rr.w, rr.h].every(isNum)) {
      out.region = {
        monitorId: rr.monitorId as number,
        x: rr.x as number,
        y: rr.y as number,
        w: rr.w as number,
        h: rr.h as number,
      };
    }
  }
  const keep = (
    key: keyof NonNullable<AppConfig["lastUsed"]>,
    specs: Record<string, Validator>,
  ) => {
    for (const [k, ok] of Object.entries(specs)) recordLeaf(`lastUsed.${key}.${k}`, ok);
    const sub = o[key];
    if (!sub || typeof sub !== "object") return;
    const s = sub as Record<string, unknown>;
    const acc: Record<string, unknown> = {};
    for (const [k, ok] of Object.entries(specs)) {
      if (k in s && ok(s[k])) acc[k] = s[k];
    }
    if (Object.keys(acc).length) (out as Record<string, unknown>)[key] = acc;
  };
  keep("rect", {
    strokeColor: isStr,
    strokeWidth: isNum,
    shape: inSet("rect", "ellipse", "line", "dashline"),
    cornerRadius: isNum,
  });
  keep("arrow", {
    strokeColor: isStr,
    strokeWidth: isNum,
    heads: inSet("end", "both", "none"),
    dash: isBool,
  });
  keep("pen", {
    strokeColor: isStr,
    strokeWidth: isNum,
    mode: inSet("raw", "polygon", "curve"),
    polygonEpsilon: isNum,
    curveSmoothing: isNum,
  });
  keep("highlighter", { strokeColor: isStr, strokeWidth: isNum, opacity: isNum });
  keep("magnify", {
    strokeColor: isStr,
    strokeWidth: isNum,
    shape: inSet("circle", "rect"),
    zoom: isNum,
    areaOpacity: isNum,
    linkDash: isBool,
  });
  keep("text", {
    color: isStr,
    fontSize: isNum,
    fontStyle: inSet("normal", "bold", "italic", "italic bold"),
    textDecoration: inSet("", "underline", "line-through", "underline line-through"),
    fontFamily: isStr,
    backgroundColor: isStrOrNull,
    backgroundPadding: isNum,
    align: inSet("left", "center", "right"),
    lineHeight: isPosNum,
  });
  keep("blur", { blurRadius: isNum });
  keep("sticker", { fontSize: isNum });
  keep("pin", {
    color: isStr,
    size: isNum,
    labelColor: isStr,
    borderColor: isStr,
    borderWidth: isNum,
    shape: inSet("circle", "bubble", "mappin"),
    bubbleTail: inSet("down", "up", "left", "right"),
    labelStyle: inSet("numeric", "alpha"),
  });
  return Object.keys(out).length ? out : undefined;
}

export type ValidatedConfig = { config: AppConfig; issues: string[] };

/**
 * Every persisted leaf path validateConfig knows, mapped to its allowed enum
 * values (sorted) or null. Pinned per schema version by config.shape.test.ts:
 * a new key or enum value without a CONFIG_SCHEMA_VERSION bump fails there.
 */
export function persistedShape(): Record<string, unknown[] | null> {
  shapeCollector = new Map();
  try {
    validateConfig({ ...DEFAULT_CONFIG, lastUsed: {} });
    return Object.fromEntries(
      [...shapeCollector.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, v ? [...v].sort() : null]),
    );
  } finally {
    shapeCollector = null;
  }
}

export function validateConfig(raw: unknown): ValidatedConfig {
  const d = DEFAULT_CONFIG;
  const issues: string[] = [];
  if (raw !== undefined && (!raw || typeof raw !== "object")) {
    note(issues, "persisted value is not an object, using defaults");
  }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // `lastUsed` is optional → absent from DEFAULT_CONFIG; allow it explicitly.
  warnUnknownKeys("config", r, [...Object.keys(d), "lastUsed"], issues);
  const config: AppConfig = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    hotkeys: vsec("hotkeys", r.hotkeys, d.hotkeys, {
      // Every hotkey may be unbound (""): the user can clear any of them from
      // Settings, and the empty string must survive a persist/load round-trip
      // or the cleared key silently returns to its default on next launch.
      captureFull: isValidOrEmptyAccelerator,
      captureArea: isValidOrEmptyAccelerator,
      captureWindow: isValidOrEmptyAccelerator,
      captureScroll: isValidOrEmptyAccelerator,
      captureSystemArea: isValidOrEmptyAccelerator,
      showEditor: isValidOrEmptyAccelerator,
      commandRing: isValidOrEmptyAccelerator,
      commandRingV2: isValidOrEmptyAccelerator,
    }, issues),
    ring: vRing(r.ring, d.ring, issues),
    output: vsec("output", r.output, d.output, {
      defaultMode: inSet("file", "clipboard", "both"),
      fileFormat: inSet("png", "jpeg", "webp"),
      jpegQuality: isNum,
      defaultSavePath: isStrOrNull,
      filenameTemplate: isStr,
    }, issues),
    pins: vsec("pins", r.pins, d.pins, {
      continuityMode: inSet("reset", "continue"),
      lastUsedNumber: isNum,
      defaultStartNumber: isNum,
      defaultColor: isStr,
      defaultSize: isNum,
      defaultLabelColor: isStr,
      defaultBorderColor: isStr,
      defaultBorderWidth: isNum,
      defaultShape: inSet("circle", "bubble", "mappin"),
      defaultBubbleTail: inSet("down", "up", "left", "right"),
      defaultLabelStyle: inSet("numeric", "alpha"),
    }, issues),
    workspaces: vsec("workspaces", r.workspaces, d.workspaces, {
      enabled: isBool,
      max: isWorkspaceMax,
      onCapture: inSet("new", "replace"),
    }, issues),
    history: vsec("history", r.history, d.history, {
      enabled: isBool,
      max: isHistoryMax,
      viewMode: inSet("list", "grid"),
      archiveCaptures: isBool,
      archiveBudgetMb: isArchiveBudget,
    }, issues),
    general: vGeneral(r.general, d.general, issues),
    tools: vTools(r.tools, d.tools, issues),
    capture: vsec("capture", r.capture, d.capture, {
      intermediateFormat: inSet("png", "jpeg"),
      intermediateMaxEdge: isNumOrNull,
      tempJpegQuality: isNum,
    }, issues),
    updates: vsec("updates", r.updates, d.updates, {
      autoCheck: isBool,
      shareInstallId: isBool,
      checkIntervalHours: isNum,
      channel: inSet("stable", "beta"),
      skippedVersion: isStrOrNull,
      lastCheckedAt: isNumOrNull,
    }, issues),
    stickers: vsec("stickers", r.stickers, d.stickers, {
      directory: isStrOrNull,
    }, issues),
    lastUsed: vLastUsed(r.lastUsed),
  };
  return { config, issues };
}

export type EffectiveTools = {
  rect: {
    strokeColor: string;
    strokeWidth: number;
    shape: RectShapeKind;
    cornerRadius: number;
  };
  arrow: {
    strokeColor: string;
    strokeWidth: number;
    heads: ArrowHeads;
    dash: boolean;
  };
  text: {
    color: string;
    fontSize: number;
    fontStyle: "normal" | "bold" | "italic" | "italic bold";
    textDecoration: "" | "underline" | "line-through" | "underline line-through";
    fontFamily: string;
    backgroundColor: string | null;
    backgroundPadding: number;
    align: TextAlign;
    lineHeight: number;
  };
  blur: { blurRadius: number };
  pen: {
    strokeColor: string;
    strokeWidth: number;
    mode: FreehandMode;
    polygonEpsilon: number;
    curveSmoothing: number;
  };
  highlighter: { strokeColor: string; strokeWidth: number; opacity: number };
  magnify: {
    strokeColor: string;
    strokeWidth: number;
    sourceStrokeWidth: number;
    borderLinked: boolean;
    shape: MagnifyShape;
    zoom: number;
    areaOpacity: number;
    linkDash: boolean;
  };
  sticker: { fontSize: number };
  pin: {
    color: string;
    size: number;
    labelColor: string;
    borderColor: string;
    borderWidth: number;
    shape: PinShapeKind;
    bubbleTail: PinTailDir;
    labelStyle: PinLabelStyle;
  };
};

export function effectiveTools(cfg: AppConfig): EffectiveTools {
  const remember = cfg.general.rememberLastTool;
  const lu = remember ? cfg.lastUsed : undefined;
  const t = cfg.tools;
  return {
    rect: {
      strokeColor: lu?.rect?.strokeColor ?? t.rect.strokeColor,
      strokeWidth: lu?.rect?.strokeWidth ?? t.rect.strokeWidth,
      shape: lu?.rect?.shape ?? t.rect.shape,
      cornerRadius: lu?.rect?.cornerRadius ?? t.rect.cornerRadius,
    },
    arrow: {
      strokeColor: lu?.arrow?.strokeColor ?? t.arrow.strokeColor,
      strokeWidth: lu?.arrow?.strokeWidth ?? t.arrow.strokeWidth,
      heads: lu?.arrow?.heads ?? t.arrow.heads,
      dash: lu?.arrow?.dash ?? t.arrow.dash,
    },
    pen: {
      strokeColor: lu?.pen?.strokeColor ?? t.pen.strokeColor,
      strokeWidth: lu?.pen?.strokeWidth ?? t.pen.strokeWidth,
      mode: lu?.pen?.mode ?? t.pen.mode,
      polygonEpsilon: lu?.pen?.polygonEpsilon ?? t.pen.polygonEpsilon,
      curveSmoothing: lu?.pen?.curveSmoothing ?? t.pen.curveSmoothing,
    },
    highlighter: {
      strokeColor: lu?.highlighter?.strokeColor ?? t.highlighter.strokeColor,
      strokeWidth: lu?.highlighter?.strokeWidth ?? t.highlighter.strokeWidth,
      opacity: lu?.highlighter?.opacity ?? t.highlighter.opacity,
    },
    magnify: {
      strokeColor: lu?.magnify?.strokeColor ?? t.magnify.strokeColor,
      strokeWidth: lu?.magnify?.strokeWidth ?? t.magnify.strokeWidth,
      sourceStrokeWidth:
        lu?.magnify?.sourceStrokeWidth ?? t.magnify.sourceStrokeWidth,
      borderLinked: lu?.magnify?.borderLinked ?? t.magnify.borderLinked,
      shape: lu?.magnify?.shape ?? t.magnify.shape,
      zoom: lu?.magnify?.zoom ?? t.magnify.zoom,
      areaOpacity: lu?.magnify?.areaOpacity ?? t.magnify.areaOpacity,
      linkDash: lu?.magnify?.linkDash ?? t.magnify.linkDash,
    },
    text: {
      color: lu?.text?.color ?? t.text.color,
      fontSize: lu?.text?.fontSize ?? t.text.fontSize,
      fontStyle: lu?.text?.fontStyle ?? t.text.fontStyle,
      textDecoration: lu?.text?.textDecoration ?? t.text.textDecoration,
      fontFamily: lu?.text?.fontFamily ?? t.text.fontFamily,
      backgroundColor:
        lu?.text?.backgroundColor !== undefined
          ? lu.text.backgroundColor
          : t.text.backgroundColor,
      backgroundPadding: lu?.text?.backgroundPadding ?? t.text.backgroundPadding,
      align: lu?.text?.align ?? t.text.align,
      lineHeight: lu?.text?.lineHeight ?? t.text.lineHeight,
    },
    blur: {
      blurRadius: lu?.blur?.blurRadius ?? t.blur.blurRadius,
    },
    sticker: {
      fontSize: lu?.sticker?.fontSize ?? t.sticker.fontSize,
    },
    pin: {
      color: lu?.pin?.color ?? cfg.pins.defaultColor,
      size: lu?.pin?.size ?? cfg.pins.defaultSize,
      labelColor: lu?.pin?.labelColor ?? cfg.pins.defaultLabelColor,
      borderColor: lu?.pin?.borderColor ?? cfg.pins.defaultBorderColor,
      borderWidth: lu?.pin?.borderWidth ?? cfg.pins.defaultBorderWidth,
      shape: lu?.pin?.shape ?? cfg.pins.defaultShape,
      bubbleTail: lu?.pin?.bubbleTail ?? cfg.pins.defaultBubbleTail,
      labelStyle: lu?.pin?.labelStyle ?? cfg.pins.defaultLabelStyle,
    },
  };
}
