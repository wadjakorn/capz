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
  };
  general: {
    autostart: boolean;
    playSoundOnCapture: boolean;
    copyToClipboardAfterSave: boolean;
    rememberLastTool: boolean;
    onboardingCompleted: boolean;
  };
  lastUsed?: {
    tool?: Tool;
    stickerEmoji?: string;
    rect?: { strokeColor?: string; strokeWidth?: number };
    arrow?: { strokeColor?: string; strokeWidth?: number };
    text?: { color?: string; fontSize?: number };
    blur?: { blurRadius?: number };
    sticker?: { fontSize?: number };
    pin?: { color?: string; size?: number };
  };
  tools: {
    rect: { strokeColor: string; strokeWidth: number };
    arrow: { strokeColor: string; strokeWidth: number };
    text: { fontSize: number; color: string };
    blur: { blurRadius: number };
    sticker: { fontSize: number };
  };
  capture: {
    tempJpegQuality: number;
  };
  updates: {
    autoCheck: boolean;
    checkIntervalHours: number;
    channel: "stable" | "beta";
    skippedVersion: string | null;
    lastCheckedAt: number | null;
  };
};

export const DEFAULT_CONFIG: AppConfig = {
  hotkeys: {
    captureFull: "CmdOrCtrl+Alt+Shift+3",
    captureArea: "CmdOrCtrl+Alt+Shift+4",
    captureWindow: "CmdOrCtrl+Alt+Shift+5",
  },
  output: {
    defaultMode: "clipboard",
    fileFormat: "png",
    jpegQuality: 90,
    defaultSavePath: null,
    filenameTemplate: "capz-{yyyy}{MM}{dd}-{HHmmss}",
  },
  pins: {
    continuityMode: "continue",
    lastUsedNumber: 0,
    defaultStartNumber: 1,
    defaultColor: "#E5342B",
    defaultSize: 36,
  },
  general: {
    autostart: false,
    playSoundOnCapture: false,
    copyToClipboardAfterSave: false,
    rememberLastTool: true,
    onboardingCompleted: false,
  },
  tools: {
    rect: { strokeColor: "#ef4444", strokeWidth: 3 },
    arrow: { strokeColor: "#ef4444", strokeWidth: 3 },
    text: { fontSize: 24, color: "#ef4444" },
    blur: { blurRadius: 16 },
    sticker: { fontSize: 48 },
  },
  capture: {
    tempJpegQuality: 85,
  },
  updates: {
    autoCheck: true,
    checkIntervalHours: 24,
    channel: "stable",
    skippedVersion: null,
    lastCheckedAt: null,
  },
};

export const CONFIG_STORE_FILE = "config.json";
export const CONFIG_STORE_KEY = "app";

export type EffectiveTools = {
  rect: { strokeColor: string; strokeWidth: number };
  arrow: { strokeColor: string; strokeWidth: number };
  text: { color: string; fontSize: number };
  blur: { blurRadius: number };
  sticker: { fontSize: number };
  pin: { color: string; size: number };
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
    },
  };
}
