export type Tool =
  | "select"
  | "arrow"
  | "rect"
  | "text"
  | "blur"
  | "sticker"
  | "pin";

export type AppConfig = {
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
  };
  lastUsed?: {
    tool?: Tool;
    stickerEmoji?: string;
    region?: { monitorId: number; x: number; y: number; w: number; h: number };
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
    pin?: { color?: string; size?: number; labelColor?: string };
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

export const DEFAULT_CONFIG: AppConfig = {
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
  pin: { color: string; size: number; labelColor: string };
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
    },
  };
}
