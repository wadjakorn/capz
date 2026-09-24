"use client";

import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  CONFIG_BACKUP_STORE_FILE,
  CONFIG_SCHEMA_VERSION,
  CONFIG_STORE_FILE,
  CONFIG_STORE_KEY,
  DEFAULT_CONFIG,
  deepMerge,
  isPlainObject,
  migrateConfig,
  validateConfig,
  type AppConfig,
} from "@/lib/config";
import { isTauriRuntime } from "@/lib/platform";

type State = {
  config: AppConfig;
  ready: boolean;
  /** Problems found while validating the persisted config on load (empty = clean). */
  issues: string[];
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

/** Our view of what config.json holds under CONFIG_STORE_KEY (post-migration).
 * Only consulted when the file was written by a newer capz — see persist(). */
let onDisk: Record<string, unknown> | undefined;

function isFutureOnDisk(): boolean {
  const v = onDisk?.schemaVersion;
  return typeof v === "number" && v > CONFIG_SCHEMA_VERSION;
}

/**
 * Persist a settings change. `full` is the whole in-memory config after the
 * change; `patch` is just what changed.
 *
 * When config.json was written by a newer capz (the user downgraded), writing
 * `full` would stamp our older schemaVersion and drop every key and value this
 * build doesn't understand. So in that case only `patch` is merged into the
 * on-disk object and everything else is left exactly as the newer build wrote
 * it (CP-0055).
 */
async function persist(
  full: AppConfig,
  patch: Partial<AppConfig>,
  { replace = false }: { replace?: boolean } = {},
) {
  const store = await getStore();
  // `replace` swaps the patched top-level keys wholesale instead of merging
  // into them — for values like `lastUsed` that are always written complete,
  // so a sub-key dropped in memory must drop on disk too.
  const next = isFutureOnDisk()
    ? replace
      ? { ...onDisk, ...(patch as Record<string, unknown>) }
      : (deepMerge(onDisk, patch) as Record<string, unknown>)
    : (full as unknown as Record<string, unknown>);
  await store.set(CONFIG_STORE_KEY, next);
  await store.save();
  onDisk = structuredClone(next);
}

/**
 * Copy the persisted config aside before a migration / self-heal rewrite
 * replaces it. `app@v<N>` keeps the first snapshot taken from each schema
 * version (the state before that upgrade); `lastRewrite` is the latest one.
 * Returns false when the backup could not be written.
 */
async function backupBeforeRewrite(
  raw: unknown,
  fromVersion: number,
  issues: string[],
): Promise<boolean> {
  try {
    const backup = await load(CONFIG_BACKUP_STORE_FILE, { autoSave: false, defaults: {} });
    const key = `app@v${fromVersion}`;
    if (!(await backup.has(key))) await backup.set(key, raw);
    await backup.set("lastRewrite", { savedAt: Date.now(), fromVersion, issues, raw });
    await backup.save();
    return true;
  } catch (e) {
    console.error("config backup failed; leaving config.json as-is", e);
    return false;
  }
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
    pen: { ...base.pen, ...t?.pen },
    highlighter: { ...base.highlighter, ...t?.highlighter },
    magnify: { ...base.magnify, ...t?.magnify },
    sticker: { ...base.sticker, ...t?.sticker },
  };
}

export const useSettings = create<State>((set, get) => ({
  config: DEFAULT_CONFIG,
  ready: false,
  issues: [],
  init: async () => {
    if (get().ready) return;
    // Web build: no Tauri store — run on in-memory defaults, no persistence.
    if (!isTauriRuntime()) {
      set({ config: DEFAULT_CONFIG, ready: true, issues: [] });
      return;
    }
    const store = await getStore();
    const raw = await store.get<unknown>(CONFIG_STORE_KEY);
    const { value, fromVersion, future } = migrateConfig(raw);
    const validated = validateConfig(value);
    let merged = validated.config;
    let issues = validated.issues;
    onDisk = value;
    // False when the pre-rewrite backup failed: then nothing on this launch
    // may rewrite config.json in full (see the defaultSavePath write below).
    let mayRewrite = true;
    if (future) {
      // Written by a newer capz. Its extra keys and values are expected, not
      // corruption: don't self-heal (that would strip them) and don't surface
      // them as issues — the "invalid settings" toast offers a reset, which
      // would wipe the newer build's settings for good.
      issues = [];
    } else {
      // Self-heal the persisted store when either:
      //  - the shape was missing/wrong schemaVersion (older store), or
      //  - validation found invalid/unknown entries.
      // Writing the cleaned config back drops the bad keys on disk so the
      // warning doesn't recur on every launch. Valid settings are preserved,
      // and the previous file is backed up first.
      const persistedVersion = isPlainObject(raw) ? raw.schemaVersion : undefined;
      if (persistedVersion !== CONFIG_SCHEMA_VERSION || issues.length > 0) {
        mayRewrite =
          raw === undefined || (await backupBeforeRewrite(raw, fromVersion, issues));
        if (mayRewrite) {
          try {
            await store.set(CONFIG_STORE_KEY, merged);
            await store.save();
            onDisk = structuredClone(merged) as unknown as Record<string, unknown>;
          } catch (e) {
            console.error("config self-heal write failed", e);
          }
        }
      }
    }
    if (!merged.output.defaultSavePath) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dir = await invoke<string>("default_save_dir");
        merged = { ...merged, output: { ...merged.output, defaultSavePath: dir } };
        // A future store only gets this one field merged in, so it is safe
        // either way; a full rewrite waits for a launch whose backup worked.
        if (mayRewrite || isFutureOnDisk()) {
          await persist(merged, { output: { defaultSavePath: dir } } as Partial<AppConfig>);
        }
      } catch (e) {
        console.warn("default_save_dir resolution failed", e);
      }
    }
    set({ config: merged, ready: true, issues });
    // Cross-window sync: another webview (e.g. Settings) may write the store.
    // Pull updates into this window's in-memory state so changes (closeAction,
    // hotkeys, etc.) take effect without restart.
    try {
      await store.onKeyChange<unknown>(CONFIG_STORE_KEY, (v) => {
        if (!v) return;
        const m = migrateConfig(v);
        onDisk = m.value;
        const { config: next } = validateConfig(m.value);
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
    if (!isTauriRuntime()) return;
    await persist(next, { [section]: patch } as Partial<AppConfig>);
  },
  setLastUsed: async (v) => {
    const next = { ...get().config, lastUsed: v };
    set({ config: next });
    if (!isTauriRuntime()) return;
    await persist(next, { lastUsed: v }, { replace: true });
  },
  reset: async () => {
    // Wipe the whole store file (drops any stray root-level keys too), write a
    // clean default, and clear the surfaced issues. Throws on failure so the
    // caller's toast can reflect it instead of silently leaving a dirty file.
    set({ config: DEFAULT_CONFIG, issues: [] });
    if (!isTauriRuntime()) return;
    const store = await getStore();
    // `permissions` (notice.ts) is macOS permission bookkeeping, not a user
    // preference — a settings reset must not drop it.
    let permissions: unknown;
    try {
      permissions = await store.get("permissions");
    } catch (e) {
      console.warn("config store read of permissions failed", e);
    }
    try {
      await store.clear();
    } catch (e) {
      console.warn("config store clear failed (continuing with set)", e);
    }
    await store.set(CONFIG_STORE_KEY, DEFAULT_CONFIG);
    if (permissions !== undefined) {
      try {
        await store.set("permissions", permissions);
      } catch (e) {
        console.warn("config store restore of permissions failed", e);
      }
    }
    await store.save();
    onDisk = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  },
}));
