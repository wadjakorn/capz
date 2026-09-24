import type { Story } from "@ladle/react";
import { useEffect } from "react";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { setUpdateStatus } from "@/lib/appVersion";
import { useSettingsNav } from "@/lib/settingsNav";
import { useSeenSettings } from "@/lib/settingNews";
import { SETTINGS } from "@/components/settings/registry";
import type { PageId } from "@/components/settings/registry";
import { useSettings } from "@/stores/settings";

/**
 * The settings sidebar in the states it is actually seen in. The app version
 * is read from Tauri, so it shows as "—" here.
 */
function Frame({
  page = "capture",
  children,
}: {
  page?: PageId;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    useSettingsNav.getState().setPage(page);
  }, [page]);

  return (
    <div className="flex h-[420px] gap-6 rounded-2xl bg-[var(--bg)] p-6 text-foreground">
      <SettingsSidebar />
      <div className="flex-1 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        {children ?? "page content"}
      </div>
    </div>
  );
}

export const Default: Story = () => {
  useEffect(() => setUpdateStatus({ state: "ok", at: Date.now() }), []);
  return <Frame />;
};

export const CheckingForUpdates: Story = () => {
  useEffect(() => setUpdateStatus({ state: "checking" }), []);
  return <Frame page="after" />;
};

export const UpdateAvailable: Story = () => {
  useEffect(
    () => setUpdateStatus({ state: "available", version: "0.14.0", at: Date.now() }),
    [],
  );
  return <Frame page="app" />;
};

export const CheckFailed: Story = () => {
  useEffect(
    () => setUpdateStatus({ state: "error", error: "offline", at: Date.now() }),
    [],
  );
  return <Frame page="library" />;
};

export const WithNewSettings: Story = () => {
  useEffect(() => {
    // Pretend a setting arrived in a version this user has not seen yet.
    (SETTINGS["library.clear"] as { addedIn?: string }).addedIn = "9.9.9";
    useSeenSettings.getState().reset();
    const { config } = useSettings.getState();
    useSettings.setState({
      config: {
        ...config,
        general: { ...config.general, lastSeenSettingsVersion: "0.13.0" },
      },
    });
    return () => {
      delete (SETTINGS["library.clear"] as { addedIn?: string }).addedIn;
    };
  }, []);
  return <Frame />;
};

export const NarrowEditor: Story = () => (
  <div className="w-[680px]">
    <Frame />
  </div>
);
