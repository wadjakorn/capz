import { isTauriRuntime } from "@/lib/platform";
import { uid } from "@/lib/uid";
import { useSettings } from "@/stores/settings";

/**
 * Opt-in anonymous install id (CP: active-install count).
 *
 * A random UUID that is sent as `X-Capz-Install` with the update check when
 * `updates.shareInstallId` is on. It is stored in its own store file so a
 * Settings reset (which clears config.json) does not touch it, and it is
 * deleted the moment the user turns sharing off — re-enabling always mints
 * a fresh id. Nothing about the machine or user feeds into it.
 */
export const TELEMETRY_STORE_FILE = "telemetry.json";
export const INSTALL_ID_HEADER = "X-Capz-Install";

const KEY_ID = "installId";
/** App version at which the opt-in nudge was last shown (or explicitly answered). */
const KEY_NUDGE_VERSION = "nudgeVersion";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

type Store = Awaited<ReturnType<typeof import("@tauri-apps/plugin-store").load>>;

async function openStore(): Promise<Store> {
  const { load } = await import("@tauri-apps/plugin-store");
  return load(TELEMETRY_STORE_FILE, { autoSave: false, defaults: {} });
}

/** Returns the stored id, minting one if absent. `null` on the web runtime. */
export async function getOrCreateInstallId(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const store = await openStore();
  const current = await store.get<unknown>(KEY_ID);
  if (isUuidLike(current)) return current;
  const id = uid();
  await store.set(KEY_ID, id);
  await store.save();
  return id;
}

export async function clearInstallId(): Promise<void> {
  if (!isTauriRuntime()) return;
  const store = await openStore();
  if (await store.has(KEY_ID)) {
    await store.delete(KEY_ID);
    await store.save();
  }
}

/**
 * Header to attach to the updater `check()` call, or `undefined` when the
 * user has not opted in.
 */
export async function installIdHeaders(): Promise<Record<string, string> | undefined> {
  if (!useSettings.getState().config.updates.shareInstallId) return undefined;
  const id = await getOrCreateInstallId();
  return id ? { [INSTALL_ID_HEADER]: id } : undefined;
}

/**
 * Flip the setting and keep the stored id consistent with it. An explicit
 * choice either way also settles the nudge for this app version: the user has
 * seen the option, so we do not ask again until the next update.
 */
export async function setShareInstallId(enabled: boolean): Promise<void> {
  await markNudgeShown();
  if (enabled) {
    // Always start from a fresh id so "off then on" cannot be linked to the
    // previous identity.
    await clearInstallId();
    await getOrCreateInstallId();
  } else {
    await clearInstallId();
  }
  await useSettings.getState().update("updates", { shareInstallId: enabled });
}

export async function currentAppVersion(): Promise<string> {
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/**
 * Nudge bookkeeping. The opt-in toast is shown at most once per app version
 * while sharing is off, so every update re-asks users who never opted in.
 * `true` here means "already asked (or answered) on this version".
 */
export async function wasNudgeShown(): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  const [store, version] = await Promise.all([openStore(), currentAppVersion()]);
  return (await store.get<string>(KEY_NUDGE_VERSION)) === version;
}

export async function markNudgeShown(): Promise<void> {
  if (!isTauriRuntime()) return;
  const [store, version] = await Promise.all([openStore(), currentAppVersion()]);
  await store.set(KEY_NUDGE_VERSION, version);
  await store.save();
}
