import type { PinShapeKind } from "@/stores/editor";

export type Tool =
  | "select"
  | "arrow"
  | "rect"
  | "text"
  | "blur"
  | "sticker"
  | "pin";

export type AppConfig = {
  schemaVersion: number;
  hotkeys: {
    captureFull: string;
    captureArea: string;
    captureWindow: string;
    showEditor: string;
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
  };
  general: {
    autostart: boolean;
    playSoundOnCapture: boolean;
    rememberLastTool: boolean;
    rememberLastRegion: boolean;
    onboardingCompleted: boolean;
    alwaysOnTopEditor: boolean;
    closeAction: "none" | "copy" | "file" | "both";
    editorWindow: { width: number; height: number };
    showRulers: boolean;
    snapEnabled: boolean;
  };
  lastUsed?: {
    tool?: Tool;
    stickerEmoji?: string;
    region?: { monitorId: number; x: number; y: number; w: number; h: number };
    lastCaptureKind?: "full" | "area" | "window";
    rect?: { strokeColor?: string; strokeWidth?: number };
    arrow?: { strokeColor?: string; strokeWidth?: number };
    text?: {
      color?: string;
      fontSize?: number;
      fontStyle?: "normal" | "bold" | "italic" | "italic bold";
      textDecoration?: "" | "underline" | "line-through" | "underline line-through";
      fontFamily?: string;
      backgroundColor?: string | null;
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
    };
  };
  tools: {
    rect: { strokeColor: string; strokeWidth: number };
    arrow: { strokeColor: string; strokeWidth: number };
    text: {
      fontSize: number;
      color: string;
      fontStyle: "normal" | "bold" | "italic" | "italic bold";
      textDecoration: "" | "underline" | "line-through" | "underline line-through";
      fontFamily: string;
      backgroundColor: string | null;
    };
    blur: { blurRadius: number };
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
    showEditor: "CmdOrCtrl+Alt+Shift+0",
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
  },
  general: {
    autostart: false,
    playSoundOnCapture: false,
    rememberLastTool: true,
    rememberLastRegion: false,
    onboardingCompleted: false,
    alwaysOnTopEditor: false,
    closeAction: "copy",
    editorWindow: { width: 1024, height: 680 },
    showRulers: false,
    snapEnabled: true,
  },
  tools: {
    rect: { strokeColor: "#ef4444", strokeWidth: 3 },
    arrow: { strokeColor: "#ef4444", strokeWidth: 3 },
    text: {
      fontSize: 24,
      color: "#ef4444",
      fontStyle: "normal",
      textDecoration: "",
      fontFamily: "system-ui, sans-serif",
      backgroundColor: null,
    },
    blur: { blurRadius: 16 },
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
const isStrOrNull: Validator = (v) => v === null || typeof v === "string";
const isNumOrNull: Validator = (v) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
const inSet =
  (...opts: unknown[]): Validator =>
  (v) =>
    opts.includes(v);

/** Warn about keys present in the persisted object but absent from the schema. */
function warnUnknownKeys(path: string, obj: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      console.warn(`config: unknown key ${path}.${key}, ignoring`);
    }
  }
}

/** Validate a flat section: copy each known leaf if valid, else warn + default. */
function vsec<T extends Record<string, unknown>>(
  path: string,
  raw: unknown,
  def: T,
  specs: { [K in keyof T]?: Validator },
): T {
  const out = { ...def };
  if (raw === undefined) return out;
  if (!raw || typeof raw !== "object") {
    console.warn(`config: invalid ${path} (not an object), using defaults`);
    return out;
  }
  const obj = raw as Record<string, unknown>;
  warnUnknownKeys(path, obj, Object.keys(def));
  for (const key of Object.keys(def) as (keyof T & string)[]) {
    if (!(key in obj)) continue; // missing → keep default silently
    const spec = specs[key];
    const val = obj[key];
    if (spec && spec(val)) {
      (out as Record<string, unknown>)[key] = val;
    } else {
      console.warn(`config: invalid ${path}.${key}, using default`);
    }
  }
  return out;
}

function vGeneral(
  raw: unknown,
  def: AppConfig["general"],
): AppConfig["general"] {
  const flat = vsec("general", raw, def, {
    autostart: isBool,
    playSoundOnCapture: isBool,
    rememberLastTool: isBool,
    rememberLastRegion: isBool,
    onboardingCompleted: isBool,
    alwaysOnTopEditor: isBool,
    closeAction: inSet("none", "copy", "file", "both"),
    showRulers: isBool,
    snapEnabled: isBool,
  });
  const ewRaw =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).editorWindow
      : undefined;
  flat.editorWindow = vsec("general.editorWindow", ewRaw, def.editorWindow, {
    width: isNum,
    height: isNum,
  });
  return flat;
}

function vTools(raw: unknown, def: AppConfig["tools"]): AppConfig["tools"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (raw && typeof raw === "object") warnUnknownKeys("tools", r, Object.keys(def));
  return {
    rect: vsec("tools.rect", r.rect, def.rect, {
      strokeColor: isStr,
      strokeWidth: isNum,
    }),
    arrow: vsec("tools.arrow", r.arrow, def.arrow, {
      strokeColor: isStr,
      strokeWidth: isNum,
    }),
    text: vsec("tools.text", r.text, def.text, {
      fontSize: isNum,
      color: isStr,
      fontStyle: inSet("normal", "bold", "italic", "italic bold"),
      textDecoration: inSet("", "underline", "line-through", "underline line-through"),
      fontFamily: isStr,
      backgroundColor: isStrOrNull,
    }),
    blur: vsec("tools.blur", r.blur, def.blur, { blurRadius: isNum }),
    sticker: vsec("tools.sticker", r.sticker, def.sticker, { fontSize: isNum }),
  };
}

/** lastUsed is non-critical (drives "remember last tool"); validate leniently,
 * dropping only the sub-fields that are malformed. */
function vLastUsed(raw: unknown): AppConfig["lastUsed"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: NonNullable<AppConfig["lastUsed"]> = {};
  if (inSet("select", "arrow", "rect", "text", "blur", "sticker", "pin")(o.tool))
    out.tool = o.tool as Tool;
  if (isStr(o.stickerEmoji)) out.stickerEmoji = o.stickerEmoji as string;
  if (inSet("full", "area", "window")(o.lastCaptureKind))
    out.lastCaptureKind = o.lastCaptureKind as "full" | "area" | "window";
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
  keep("rect", { strokeColor: isStr, strokeWidth: isNum });
  keep("arrow", { strokeColor: isStr, strokeWidth: isNum });
  keep("text", {
    color: isStr,
    fontSize: isNum,
    fontStyle: inSet("normal", "bold", "italic", "italic bold"),
    textDecoration: inSet("", "underline", "line-through", "underline line-through"),
    fontFamily: isStr,
    backgroundColor: isStrOrNull,
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
  });
  return Object.keys(out).length ? out : undefined;
}

export function validateConfig(raw: unknown): AppConfig {
  const d = DEFAULT_CONFIG;
  if (raw !== undefined && (!raw || typeof raw !== "object")) {
    console.warn("config: persisted value is not an object, using defaults");
  }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // `lastUsed` is optional → absent from DEFAULT_CONFIG; allow it explicitly.
  warnUnknownKeys("config", r, [...Object.keys(d), "lastUsed"]);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    hotkeys: vsec("hotkeys", r.hotkeys, d.hotkeys, {
      captureFull: isStr,
      captureArea: isStr,
      captureWindow: isStr,
      showEditor: isStr,
    }),
    output: vsec("output", r.output, d.output, {
      defaultMode: inSet("file", "clipboard", "both"),
      fileFormat: inSet("png", "jpeg", "webp"),
      jpegQuality: isNum,
      defaultSavePath: isStrOrNull,
      filenameTemplate: isStr,
    }),
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
    }),
    general: vGeneral(r.general, d.general),
    tools: vTools(r.tools, d.tools),
    capture: vsec("capture", r.capture, d.capture, {
      intermediateFormat: inSet("png", "jpeg"),
      intermediateMaxEdge: isNumOrNull,
      tempJpegQuality: isNum,
    }),
    updates: vsec("updates", r.updates, d.updates, {
      autoCheck: isBool,
      checkIntervalHours: isNum,
      channel: inSet("stable", "beta"),
      skippedVersion: isStrOrNull,
      lastCheckedAt: isNumOrNull,
    }),
    stickers: vsec("stickers", r.stickers, d.stickers, {
      directory: isStrOrNull,
    }),
    lastUsed: vLastUsed(r.lastUsed),
  };
}

export type EffectiveTools = {
  rect: { strokeColor: string; strokeWidth: number };
  arrow: { strokeColor: string; strokeWidth: number };
  text: {
    color: string;
    fontSize: number;
    fontStyle: "normal" | "bold" | "italic" | "italic bold";
    textDecoration: "" | "underline" | "line-through" | "underline line-through";
    fontFamily: string;
    backgroundColor: string | null;
  };
  blur: { blurRadius: number };
  sticker: { fontSize: number };
  pin: {
    color: string;
    size: number;
    labelColor: string;
    borderColor: string;
    borderWidth: number;
    shape: PinShapeKind;
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
    },
    arrow: {
      strokeColor: lu?.arrow?.strokeColor ?? t.arrow.strokeColor,
      strokeWidth: lu?.arrow?.strokeWidth ?? t.arrow.strokeWidth,
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
    },
  };
}
