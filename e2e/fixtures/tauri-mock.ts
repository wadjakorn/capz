import type { Page } from "@playwright/test";

/**
 * Default invoke handlers mirroring src-tauri/src/commands/*.
 * Override per-test via `installTauriMock(page, { handlers: { … } })`.
 */
export type InvokeHandlers = Record<string, (args: any) => any | Promise<any>>;

export const defaultHandlers: InvokeHandlers = {
  // capture.rs
  trigger_capture_command: () => null,
  capture_full_command: () => "/tmp/capz-test-full.png",
  capture_full_monitor: () => "/tmp/capz-test-mon.png",
  capture_region_command: () => "/tmp/capz-test-region.png",
  capture_window_command: () => "/tmp/capz-test-window.png",
  probe_capture_command: () => true,
  list_monitors_command: () => [
    { id: 1, name: "Mock", x: 0, y: 0, width: 1920, height: 1080, scale_factor: 2 },
  ],

  // editor.rs
  editor_current_image: () => null,
  clear_editor_workspace: () => null,
  paste_into_editor: () => null,
  set_editor_always_on_top: () => null,
  default_save_dir: () => "/Users/test/Pictures",

  // output.rs
  reveal_in_finder: () => null,

  // pickers.rs / overlay.rs
  close_overlay_command: () => null,
  set_overlay_cutout: () => null,
  list_capture_windows: () => [],

  // permissions.rs
  has_screen_recording_permission: () => true,
  request_screen_recording_permission: () => true,
  open_system_settings_screen_recording: () => null,
  relaunch_app: () => null,

  // shortcuts.rs
  reregister_shortcuts: () => null,
  suspend_shortcuts: () => null,

  // stickers.rs
  list_stickers: () => [],

  // windows.rs
  show_onboarding_window: () => null,

  // tauri-plugin-store — load returns a resource id (rid), other ops keyed by it.
  "plugin:store|load": () => 1,
  "plugin:store|create_store": () => 1,
  "plugin:store|get": () => null,
  "plugin:store|set": () => null,
  "plugin:store|save": () => null,
  "plugin:store|reload": () => null,
  "plugin:store|has": () => false,
  "plugin:store|keys": () => [],
  "plugin:store|values": () => [],
  "plugin:store|entries": () => [],
  "plugin:store|length": () => 0,
  "plugin:store|close_store": () => null,
  "plugin:store|on_key_change": () => 0,

  // tauri-plugin-autostart
  "plugin:autostart|enable": () => null,
  "plugin:autostart|disable": () => null,
  "plugin:autostart|is_enabled": () => false,

  // tauri-plugin-updater
  "plugin:updater|check": () => null,

  // tauri-plugin-dialog
  "plugin:dialog|save": () => null,
  "plugin:dialog|open": () => null,
  "plugin:dialog|message": () => null,

  // tauri-plugin-fs
  "plugin:fs|read_file": () => new Uint8Array(),
  "plugin:fs|write_file": () => null,
  "plugin:fs|exists": () => true,

  // tauri-plugin-clipboard-manager
  "plugin:clipboard-manager|write_image": () => null,
  "plugin:clipboard-manager|read_image": () => new Uint8Array(),

  // event plugin (listen/emit)
  "plugin:event|listen": () => 0,
  "plugin:event|unlisten": () => null,
  "plugin:event|emit": () => null,
  "plugin:event|emit_to": () => null,

  // window plugin (getCurrentWindow + onCloseRequested)
  "plugin:window|hide": () => null,
  "plugin:window|show": () => null,
  "plugin:window|close": () => null,
  "plugin:window|set_focus": () => null,
};

export async function installTauriMock(
  page: Page,
  opts: { handlers?: InvokeHandlers } = {},
): Promise<void> {
  const handlers = { ...defaultHandlers, ...(opts.handlers ?? {}) };

  await page.addInitScript((serialized) => {
    const handlerMap = new Map<string, (args: any) => any>();
    for (const [cmd, fn] of serialized as Array<[string, string]>) {
      // eslint-disable-next-line no-new-func
      handlerMap.set(cmd, new Function(`return (${fn})`)());
    }

    const calls: Array<{ cmd: string; args: unknown }> = [];
    (window as any).__capzInvokeCalls = calls;

    const invoke = async (cmd: string, args: unknown = {}) => {
      calls.push({ cmd, args });
      const h = handlerMap.get(cmd);
      if (!h) {
        console.warn(`[tauri-mock] unhandled invoke: ${cmd}`);
        return null;
      }
      return await h(args);
    };

    (window as any).__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: (cb: any) => {
        const id = Math.floor(Math.random() * 1e9);
        (window as any).__TAURI_INTERNALS__.callbacks ??= new Map();
        (window as any).__TAURI_INTERNALS__.callbacks.set(id, cb);
        return id;
      },
      convertFileSrc: (filePath: string, protocol = "asset") =>
        `http://${protocol}.localhost/${encodeURIComponent(filePath)}`,
      metadata: { currentWindow: { label: "editor" }, currentWebview: { label: "editor" } },
      runtime: "test",
      plugins: {},
      ipc: { postMessage: () => {} },
    };
  }, Array.from(Object.entries(handlers)).map(([k, v]) => [k, v.toString()]));
}

export async function getInvokeCalls(page: Page): Promise<Array<{ cmd: string; args: unknown }>> {
  return await page.evaluate(() => (window as any).__capzInvokeCalls ?? []);
}
