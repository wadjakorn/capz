"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  CONFIG_SCHEMA_VERSION,
  CONFIG_STORE_FILE,
  CONFIG_STORE_KEY,
  DEFAULT_CONFIG,
  migrateConfig,
  validateConfig,
  type AppConfig,
} from "@/lib/config";

type State = {
  config: AppConfig;
  ready: boolean;
  init: () => Promise<void>;
  update: <K extends Exclude<keyof AppConfig, "schemaVersion">>(
    section: K,
    patch: Partial<AppConfig[K]>,
  ) => Promise<void>;
  setLastUsed: (v: NonNullable<AppConfig["lastUsed"]>) => Promise<void>;
  reset: () => Promise<void>;
};

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(CONFIG_STORE_FILE, { autoSave: false, defaults: {} });
  return storePromise;
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

export const useSettings = create<State>((set, get) => ({
  config: DEFAULT_CONFIG,
  ready: false,
  init: async () => {
    if (get().ready) return;
    const store = await getStore();
    const raw = await store.get<unknown>(CONFIG_STORE_KEY);
    const migrated = migrateConfig(raw);
    let merged = validateConfig(migrated);
    // Write back if the persisted shape was missing schemaVersion (pre-v1
    // store) so subsequent launches can detect old shapes via the version.
    const persistedVersion =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>).schemaVersion
        : undefined;
    if (persistedVersion !== CONFIG_SCHEMA_VERSION) {
      await store.set(CONFIG_STORE_KEY, merged);
      await store.save();
    }
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
        const next = validateConfig(value);
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
