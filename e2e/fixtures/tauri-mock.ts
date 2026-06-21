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
  reregister_shortcuts: () => [],
  suspend_shortcuts: () => null,
  probe_hotkey: () => ({ status: "ok" }),

  // stickers.rs
  list_stickers: () => [],

  // windows.rs
  show_onboarding_window: () => null,

  // tauri-plugin-store — load returns a resource id (rid), other ops keyed by it.
  "plugin:store|load": () => 1,
  "plugin:store|create_store": () => 1,
  // plugin-store's Store.get destructures `[value, exists]`. Even when there's
  // no stateful backing, return the tuple shape so consumers don't crash.
  "plugin:store|get": () => [null, false],
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

    // event-name -> Set<callbackId> mapping for test-driven emits.
    const eventSubs = new Map<string, Set<number>>();
    (window as any).__capzEventSubs = eventSubs;

    // Stateful tauri-plugin-store backing: a simple in-memory key/value bag so
    // store.get / set / save round-trip and consumers (useSettings.init) can
    // flip `ready` true without a real backend.
    const storeData = new Map<string, unknown>();
    (window as any).__capzStoreData = storeData;
    const storeGet = (args: any) => {
      // plugin-store's Store.get destructures `[value, exists]`. Returning a
      // bare value here crashes useSettings.init at the destructure step.
      const key = String(args?.key ?? "");
      if (storeData.has(key)) return [storeData.get(key), true];
      return [null, false];
    };
    const storeSet = (args: any) => {
      const key = String(args?.key ?? "");
      storeData.set(key, args?.value);
      return null;
    };
    const storeHas = (args: any) => storeData.has(String(args?.key ?? ""));
    const storeKeys = () => Array.from(storeData.keys());
    const storeEntries = () => Array.from(storeData.entries());
    const storeValues = () => Array.from(storeData.values());
    // Wire stateful store ops only when the consumer didn't supply their own
    // override (e.g. a test that wants to track writes). User-supplied handler
    // remains in handlerMap.get() because we register stateful ops via fallback.
    const installFallback = (cmd: string, fn: (a: any) => unknown) => {
      const userFn = handlerMap.get(cmd);
      // The default handlers stored at install-time are simple constant
      // returns; replace them with the stateful version. If the user passed
      // a custom override via opts.handlers, leave it in place so they can
      // observe writes (storeWrites pattern in settings-hotkey.spec.ts).
      const isDefault = userFn && userFn.toString().length < 80;
      if (!userFn || isDefault) handlerMap.set(cmd, fn);
    };
    installFallback("plugin:store|get", storeGet);
    installFallback("plugin:store|set", storeSet);
    installFallback("plugin:store|has", storeHas);
    installFallback("plugin:store|keys", storeKeys);
    installFallback("plugin:store|entries", storeEntries);
    installFallback("plugin:store|values", storeValues);
    installFallback("plugin:store|length", () => storeData.size);

    // Intercept plugin:event|listen to record subscriptions.
    const originalListen = handlerMap.get("plugin:event|listen");
    handlerMap.set("plugin:event|listen", (args: any) => {
      const ev = args?.event;
      const cbId = args?.handler;
      if (typeof ev === "string" && typeof cbId === "number") {
        if (!eventSubs.has(ev)) eventSubs.set(ev, new Set());
        eventSubs.get(ev)!.add(cbId);
      }
      return originalListen ? originalListen(args) : cbId ?? 0;
    });

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

    // Test helper: fire a Tauri event payload to all registered listeners.
    (window as any).__capzEmit = (event: string, payload: unknown) => {
      const subs = eventSubs.get(event);
      const cbs = (window as any).__TAURI_INTERNALS__.callbacks as
        | Map<number, (e: unknown) => void>
        | undefined;
      if (!subs || !cbs) return 0;
      let n = 0;
      for (const id of subs) {
        const cb = cbs.get(id);
        if (cb) {
          cb({ event, id, payload });
          n++;
        }
      }
      return n;
    };
  }, Array.from(Object.entries(handlers)).map(([k, v]) => [k, v.toString()]));
}

export async function getInvokeCalls(page: Page): Promise<Array<{ cmd: string; args: unknown }>> {
  return await page.evaluate(() => (window as any).__capzInvokeCalls ?? []);
}

/**
 * Fire a Tauri event payload to all listeners that subscribed via
 * @tauri-apps/api/event#listen. Returns the number of callbacks invoked.
 */
export async function emitTauriEvent(
  page: Page,
  event: string,
  payload: unknown = null,
): Promise<number> {
  return await page.evaluate(
    ({ event, payload }) => (window as any).__capzEmit?.(event, payload) ?? 0,
    { event, payload },
  );
}
