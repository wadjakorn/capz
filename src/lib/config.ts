import type {
  PinShapeKind,
  PinTailDir,
  RectShapeKind,
  FreehandMode,
  MagnifyShape,
  ArrowHeads,
  TextAlign,
} from "@/stores/editor";
import { validateAccelerator } from "@/lib/shortcuts";

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

export type AppConfig = {
  schemaVersion: number;
  hotkeys: {
    captureFull: string;
    captureArea: string;
    captureWindow: string;
    /** Scrolling capture — may be "" (unbound; no default key). */
    captureScroll: string;
    showEditor: string;
    commandRing: string;
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
  };
  general: {
    theme: "light" | "dark" | "system";
    autostart: boolean;
    playSoundOnCapture: boolean;
    rememberLastTool: boolean;
    onboardingCompleted: boolean;
    alwaysOnTopEditor: boolean;
    closeAction: "none" | "copy" | "file" | "both";
    editorWindow: { width: number; height: number };
    showRulers: boolean;
    snapEnabled: boolean;
    canvasBackground: string;
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
    checkIntervalHours: number;
    channel: "stable" | "beta";
    skippedVersion: string | null;
    lastCheckedAt: number | null;
  };
  stickers: {
    directory: string | null;
  };
};

export const CONFIG_SCHEMA_VERSION = 1;

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  hotkeys: {
    captureFull: "CmdOrCtrl+Alt+Shift+3",
    captureArea: "CmdOrCtrl+Alt+Shift+4",
    captureWindow: "CmdOrCtrl+Alt+Shift+5",
    captureScroll: "",
    showEditor: "CmdOrCtrl+Alt+Shift+0",
    commandRing: "CmdOrCtrl+Shift+Space",
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
  },
  general: {
    theme: "dark",
    autostart: false,
    playSoundOnCapture: false,
    rememberLastTool: true,
    onboardingCompleted: false,
    alwaysOnTopEditor: false,
    closeAction: "copy",
    editorWindow: { width: 1024, height: 680 },
    showRulers: false,
    snapEnabled: true,
    canvasBackground: "#ffffff",
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

// Forward-compatible migration entry point. v1 = initial schema, so any
// persisted shape (including pre-versioned stores) is passed through.
// Future schema bumps add cases that transform `raw` to the latest shape
// before merge() in useSettings.init() fills in defaults.
export function migrateConfig(raw: unknown): Partial<AppConfig> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const v = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 0;
  if (v > CONFIG_SCHEMA_VERSION) {
    console.warn(
      `config schemaVersion ${v} newer than supported ${CONFIG_SCHEMA_VERSION}; loading as-is`,
    );
  }
  // Retired in the area-capture revamp: region persistence is now unconditional,
  // so `general.rememberLastRegion` no longer exists. Strip it here so upgraded
  // stores validate cleanly instead of tripping the unknown-key warning.
  if (obj.general && typeof obj.general === "object") {
    delete (obj.general as Record<string, unknown>).rememberLastRegion;
  }
  return obj as Partial<AppConfig>;
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
const isValidAccelerator: Validator = (v) =>
  typeof v === "string" && validateAccelerator(v).ok;
// Same, but an empty string is allowed — used for hotkeys that may be unbound
// (e.g. scrolling capture ships with no default key).
const isValidOrEmptyAccelerator: Validator = (v) =>
  v === "" || (typeof v === "string" && validateAccelerator(v).ok);
const isNumOrNull: Validator = (v) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
const inSet =
  (...opts: unknown[]): Validator =>
  (v) =>
    opts.includes(v);

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
    },
    issues,
  );
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
  if (
    inSet(
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
    )(o.tool)
  )
    out.tool = o.tool as Tool;
  if (isStr(o.stickerEmoji)) out.stickerEmoji = o.stickerEmoji as string;
  if (inSet("full", "area", "window")(o.lastCaptureKind))
    out.lastCaptureKind = o.lastCaptureKind as "full" | "area" | "window";
  if (inSet("copy", "file", "both")(o.lastExportAction))
    out.lastExportAction = o.lastExportAction as "copy" | "file" | "both";
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
  });
  return Object.keys(out).length ? out : undefined;
}

export type ValidatedConfig = { config: AppConfig; issues: string[] };

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
      captureFull: isValidAccelerator,
      captureArea: isValidAccelerator,
      captureWindow: isValidAccelerator,
      captureScroll: isValidOrEmptyAccelerator,
      showEditor: isValidAccelerator,
      commandRing: isValidAccelerator,
    }, issues),
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
    },
  };
}
