/**
 * Runtime detection: true when running inside a Tauri webview (desktop app),
 * false in a plain browser (web build) or during SSR/prerender.
 */
export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}
