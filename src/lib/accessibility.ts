import { invoke } from "@tauri-apps/api/core";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

/**
 * Ensure the macOS Accessibility grant needed to post synthetic scroll events
 * for auto-scroll. Returns true when auto-scroll may proceed. On macOS without
 * the grant it prompts, opens System Settings, and returns false so the caller
 * can ask the user to retry. Non-macOS platforms always return true; a preflight
 * IPC error logs and returns true (best-effort — don't block on the check).
 */
export async function ensureAutoScrollPermission(): Promise<boolean> {
  if (!IS_MAC) return true;
  try {
    const ok = await invoke<boolean>("has_accessibility_permission");
    if (ok) return true;
    await invoke("request_accessibility_permission").catch(() => {});
    await invoke("open_system_settings_accessibility").catch(() => {});
    return false;
  } catch (e) {
    console.warn("accessibility preflight failed", e);
    return true;
  }
}
