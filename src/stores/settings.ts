"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { CONFIG_STORE_FILE, CONFIG_STORE_KEY, DEFAULT_CONFIG, type AppConfig } from "@/lib/config";

type State = {
  config: AppConfig;
  ready: boolean;
  init: () => Promise<void>;
  update: <K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) => Promise<void>;
  reset: () => Promise<void>;
};

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(CONFIG_STORE_FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

function merge(base: AppConfig, partial: Partial<AppConfig> | undefined): AppConfig {
  if (!partial) return base;
  const t = partial.tools;
  return {
    hotkeys: { ...base.hotkeys, ...partial.hotkeys },
    output: { ...base.output, ...partial.output },
    pins: { ...base.pins, ...partial.pins },
    general: { ...base.general, ...partial.general },
    tools: {
      ...base.tools,
      ...t,
      rect: { ...base.tools.rect, ...t?.rect },
      arrow: { ...base.tools.arrow, ...t?.arrow },
      text: { ...base.tools.text, ...t?.text },
      blur: { ...base.tools.blur, ...t?.blur },
      sticker: { ...base.tools.sticker, ...t?.sticker },
    },
  };
}

export const useSettings = create<State>((set, get) => ({
  config: DEFAULT_CONFIG,
  ready: false,
  init: async () => {
    if (get().ready) return;
    const store = await getStore();
    const persisted = await store.get<Partial<AppConfig>>(CONFIG_STORE_KEY);
    set({ config: merge(DEFAULT_CONFIG, persisted), ready: true });
  },
  update: async (section, patch) => {
    const next = { ...get().config, [section]: { ...get().config[section], ...patch } };
    set({ config: next });
    const store = await getStore();
    await store.set(CONFIG_STORE_KEY, next);
  },
  reset: async () => {
    set({ config: DEFAULT_CONFIG });
    const store = await getStore();
    await store.set(CONFIG_STORE_KEY, DEFAULT_CONFIG);
  },
}));
