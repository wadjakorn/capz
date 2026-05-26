"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { CONFIG_STORE_FILE, CONFIG_STORE_KEY, DEFAULT_CONFIG, type AppConfig } from "@/lib/config";

type State = {
  config: AppConfig;
  ready: boolean;
  init: () => Promise<void>;
  update: <K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) => Promise<void>;
  setLastUsed: (v: NonNullable<AppConfig["lastUsed"]>) => Promise<void>;
  reset: () => Promise<void>;
};

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(CONFIG_STORE_FILE, { autoSave: false, defaults: {} });
  return storePromise;
}

function isPlainLastUsed(v: unknown): v is NonNullable<AppConfig["lastUsed"]> {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    "rect" in obj ||
    "arrow" in obj ||
    "text" in obj ||
    "blur" in obj ||
    "sticker" in obj ||
    "pin" in obj ||
    "tool" in obj ||
    "stickerEmoji" in obj ||
    "region" in obj
  );
}

function migrateLastUsed(v: unknown): AppConfig["lastUsed"] | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if ("color" in o || "strokeWidth" in o || "fontSize" in o || "stickerFontSize" in o) {
    return undefined;
  }
  if (isPlainLastUsed(v)) return v;
  return undefined;
}

function mergeTools(
  base: AppConfig["tools"],
  partial: Partial<AppConfig["tools"]> | undefined,
): AppConfig["tools"] {
  const t = partial;
  return {
    rect: { ...base.rect, ...t?.rect },
    arrow: { ...base.arrow, ...t?.arrow },
    text: { ...base.text, ...t?.text },
    blur: { ...base.blur, ...t?.blur },
    sticker: { ...base.sticker, ...t?.sticker },
  };
}

function merge(base: AppConfig, partial: Partial<AppConfig> | undefined): AppConfig {
  if (!partial) return base;
  return {
    hotkeys: { ...base.hotkeys, ...partial.hotkeys },
    output: { ...base.output, ...partial.output },
    pins: { ...base.pins, ...partial.pins },
    general: { ...base.general, ...partial.general },
    tools: mergeTools(base.tools, partial.tools as Partial<AppConfig["tools"]> | undefined),
    capture: { ...base.capture, ...partial.capture },
    updates: { ...base.updates, ...partial.updates },
    stickers: { ...base.stickers, ...partial.stickers },
    lastUsed: migrateLastUsed(partial.lastUsed) ?? base.lastUsed,
  };
}

export const useSettings = create<State>((set, get) => ({
  config: DEFAULT_CONFIG,
  ready: false,
  init: async () => {
    if (get().ready) return;
    const store = await getStore();
    const persisted = await store.get<Partial<AppConfig>>(CONFIG_STORE_KEY);
    let merged = merge(DEFAULT_CONFIG, persisted);
    if (!merged.output.defaultSavePath) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dir = await invoke<string>("default_save_dir");
        merged = { ...merged, output: { ...merged.output, defaultSavePath: dir } };
        await store.set(CONFIG_STORE_KEY, merged);
        await store.save();
      } catch (e) {
        console.warn("default_save_dir resolution failed", e);
      }
    }
    set({ config: merged, ready: true });
    // Cross-window sync: another webview (e.g. Settings) may write the store.
    // Pull updates into this window's in-memory state so changes (closeAction,
    // hotkeys, etc.) take effect without restart.
    try {
      await store.onKeyChange<Partial<AppConfig>>(CONFIG_STORE_KEY, (value) => {
        if (!value) return;
        const next = merge(DEFAULT_CONFIG, value);
        set({ config: next });
      });
    } catch (e) {
      console.warn("store onKeyChange subscription failed", e);
    }
  },
  update: async (section, patch) => {
    const cur = get().config;
    const nextSection =
      section === "tools"
        ? mergeTools(cur.tools, patch as Partial<AppConfig["tools"]>)
        : { ...cur[section], ...patch };
    const next = { ...cur, [section]: nextSection };
    set({ config: next });
    const store = await getStore();
    await store.set(CONFIG_STORE_KEY, next);
    await store.save();
  },
  setLastUsed: async (v) => {
    const next = { ...get().config, lastUsed: v };
    set({ config: next });
    const store = await getStore();
    await store.set(CONFIG_STORE_KEY, next);
    await store.save();
  },
  reset: async () => {
    set({ config: DEFAULT_CONFIG });
    const store = await getStore();
    await store.set(CONFIG_STORE_KEY, DEFAULT_CONFIG);
    await store.save();
  },
}));
