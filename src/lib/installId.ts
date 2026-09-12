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
const KEY_NUDGE = "nudgeShown";

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

/** Flip the setting and keep the stored id consistent with it. */
export async function setShareInstallId(enabled: boolean): Promise<void> {
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

/** One-time nudge bookkeeping for users who finished onboarding before this existed. */
export async function wasNudgeShown(): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  const store = await openStore();
  return (await store.get<boolean>(KEY_NUDGE)) === true;
}

export async function markNudgeShown(): Promise<void> {
  if (!isTauriRuntime()) return;
  const store = await openStore();
  await store.set(KEY_NUDGE, true);
  await store.save();
}
