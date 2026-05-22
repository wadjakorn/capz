export type AppConfig = {
  hotkeys: {
    captureFull: string;
    captureArea: string;
  };
  output: {
    defaultMode: "file" | "clipboard" | "ask";
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
  };
  tools: {
    strokeColor: string;
    rect: { strokeWidth: number };
    arrow: { strokeWidth: number };
    text: { fontSize: number; color: string };
    blur: { blurRadius: number };
    sticker: { fontSize: number };
  };
};

export const DEFAULT_CONFIG: AppConfig = {
  hotkeys: {
    captureFull: "CmdOrCtrl+Alt+Shift+3",
    captureArea: "CmdOrCtrl+Alt+Shift+4",
  },
  output: {
    defaultMode: "ask",
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
  },
  tools: {
    strokeColor: "#ef4444",
    rect: { strokeWidth: 3 },
    arrow: { strokeWidth: 3 },
    text: { fontSize: 24, color: "#ef4444" },
    blur: { blurRadius: 16 },
    sticker: { fontSize: 48 },
  },
};

export const CONFIG_STORE_FILE = "config.json";
export const CONFIG_STORE_KEY = "app";
