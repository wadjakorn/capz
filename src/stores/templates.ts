"use client";

import { create } from "zustand";
import { toast } from "sonner";

import { isTauriRuntime } from "@/lib/platform";
import { pickBackdropLook, type BackdropLook, type EditTemplate } from "@/lib/template";
import { useSettings } from "@/stores/settings";
import { t as translate, type TKey, type TVars } from "@/i18n/store";

const FILE = "templates.json";
const KEY = "templates";
const BACKUP = "templates.corrupt.json";
const DEBOUNCE_MS = 800;

export type TemplatesBackend = {
  load(): Promise<{ has: boolean; value: unknown }>;
  set(v: EditTemplate[]): Promise<void>;
  save(): Promise<void>;
  fileExists(): Promise<boolean>;
  backup(): Promise<void>;
};

const memoryBackend: TemplatesBackend = {
  load: async () => ({ has: false, value: undefined }),
  set: async () => {},
  save: async () => {},
  fileExists: async () => false,
  backup: async () => {},
};

function tauriBackend(): TemplatesBackend {
  type Store = import("@tauri-apps/plugin-store").Store;
  let storeP: Promise<Store> | null = null;
  const store = () =>
    (storeP ??= import("@tauri-apps/plugin-store").then((m) =>
      m.load(FILE, { autoSave: false, defaults: {} }),
    ));
  return {
    async load() {
      const s = await store();
      const has = await s.has(KEY);
      return { has, value: has ? await s.get(KEY) : undefined };
    },
    async set(v) {
      await (await store()).set(KEY, v);
    },
    async save() {
      await (await store()).save();
    },
    async fileExists() {
      const { exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      return exists(FILE, { baseDir: BaseDirectory.AppData });
    },
    async backup() {
      const { copyFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await copyFile(FILE, BACKUP, {
        fromPathBaseDir: BaseDirectory.AppData,
        toPathBaseDir: BaseDirectory.AppData,
      });
    },
  };
}

let override: TemplatesBackend | null = null;
let defaultBackend: TemplatesBackend | null = null;
function backend(): TemplatesBackend {
  if (override) return override;
  return (defaultBackend ??= isTauriRuntime() ? tauriBackend() : memoryBackend);
}

/** Test seam; pass null to restore the default and reset module state. */
export function __setTemplatesBackend(b: TemplatesBackend | null): void {
  override = b;
  loadP = null;
  dirty = false;
  guardDone = false;
  hadValue = false;
  if (timer) clearTimeout(timer);
  timer = null;
  writing = Promise.resolve();
}

let loadP: Promise<void> | null = null;
let dirty = false;
let guardDone = false;
let hadValue = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const rec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function reviveTemplate(raw: unknown, currentLook: BackdropLook): EditTemplate | null {
  if (!rec(raw)) return null;
  const { id, name, createdAt, sourceSize, annotations, crop, backdropOn, backdropLook, thumb } = raw;
  if (typeof id !== "string" || typeof name !== "string" || !fin(createdAt)) return null;
  if (!rec(sourceSize) || !fin(sourceSize.w) || !fin(sourceSize.h) || sourceSize.w <= 0 || sourceSize.h <= 0)
    return null;
  if (!Array.isArray(annotations)) return null;
  const out: EditTemplate = {
    id,
    name,
    createdAt,
    sourceSize: { w: sourceSize.w, h: sourceSize.h },
    annotations: annotations as EditTemplate["annotations"],
    thumb: typeof thumb === "string" ? thumb : "",
  };
  if (crop !== undefined) {
    if (!rec(crop) || !fin(crop.x) || !fin(crop.y) || !fin(crop.w) || !fin(crop.h)) return null;
    out.crop = { x: crop.x, y: crop.y, w: crop.w, h: crop.h };
  }
  if (backdropOn !== undefined) {
    if (typeof backdropOn !== "boolean") return null;
    out.backdropOn = backdropOn;
  }
  if (backdropLook !== undefined) {
    const l = rec(backdropLook) ? backdropLook : {};
    out.backdropLook = {
      style: l.style === "gradient" || l.style === "solid" ? l.style : currentLook.style,
      presetId: typeof l.presetId === "string" ? l.presetId : currentLook.presetId,
      solidColor: typeof l.solidColor === "string" ? l.solidColor : currentLook.solidColor,
      padding: fin(l.padding) && l.padding >= 0 ? l.padding : currentLook.padding,
      cornerRadius: fin(l.cornerRadius) && l.cornerRadius >= 0 ? l.cornerRadius : currentLook.cornerRadius,
      shadow: typeof l.shadow === "boolean" ? l.shadow : currentLook.shadow,
    };
  }
  return out;
}

export function nextTemplateName(
  existing: EditTemplate[],
  t: (k: TKey, v?: TVars) => string,
): string {
  const names = new Set(existing.map((e) => e.name));
  for (let n = 1; ; n++) {
    const name = t("editor.templates.defaultName", { n });
    if (!names.has(name)) return name;
  }
}

type State = {
  templates: EditTemplate[];
  loaded: boolean;
  ensureLoaded(): Promise<void>;
  save(t: EditTemplate): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  flush(): Promise<void>;
};

async function doWrite(): Promise<void> {
  if (!dirty) return;
  const b = backend();
  try {
    if (!guardDone) {
      if (!hadValue && (await b.fileExists())) {
        await b.backup();
        toast(translate("editor.templates.corruptBackup"));
      }
      guardDone = true;
    }
    dirty = false;
    await b.set(useTemplates.getState().templates);
    await b.save();
  } catch {
    dirty = true;
    toast(translate("editor.templates.saveFailed"));
  }
}

function schedule() {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void useTemplates.getState().flush();
  }, DEBOUNCE_MS);
}

export const useTemplates = create<State>((set, get) => {
  const mutate = async (fn: (cur: EditTemplate[]) => EditTemplate[]) => {
    await get().ensureLoaded();
    set({ templates: fn(get().templates) });
    schedule();
  };
  return {
    templates: [],
    loaded: false,
    ensureLoaded() {
      if (loadP) return loadP;
      const p: Promise<void> = (async () => {
        const { has, value } = await backend().load();
        hadValue = has;
        const look = pickBackdropLook(useSettings.getState().config.general.backdrop);
        const list = has && Array.isArray(value) ? value : [];
        const revived = list
          .map((r) => reviveTemplate(r, look))
          .filter((r): r is EditTemplate => r !== null);
        set({ templates: revived, loaded: true });
      })();
      loadP = p;
      p.catch(() => {
        if (loadP === p) loadP = null;
      });
      return p;
    },
    save: (tpl) => mutate((cur) => [...cur, tpl]),
    rename: (id, name) => mutate((cur) => cur.map((x) => (x.id === id ? { ...x, name } : x))),
    remove: (id) => mutate((cur) => cur.filter((x) => x.id !== id)),
    async flush() {
      if (!dirty) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      writing = writing.then(doWrite);
      await writing;
    },
  };
});
