"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Toolbar } from "@/components/editor/Toolbar";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";

const EditorStage = dynamic(
  () => import("@/components/editor/EditorStage").then((m) => m.EditorStage),
  { ssr: false },
);

function EditorInner() {
  const params = useSearchParams();
  const file = params.get("file") ?? "";
  const [src, setSrc] = useState("");

  useEditorShortcuts();

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
      if (!cancelled) setSrc(convertFileSrc(file));
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!file) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const [{ getCurrentWindow }, { remove }] = await Promise.all([
        import("@tauri-apps/api/window"),
        import("@tauri-apps/plugin-fs"),
      ]);
      const win = getCurrentWindow();
      unlisten = await win.onCloseRequested(async (e) => {
        e.preventDefault();
        try {
          await remove(file);
        } catch (err) {
          console.warn("temp file cleanup failed", err);
        }
        await win.destroy();
      });
    })();
    return () => unlisten?.();
  }, [file]);

  if (!file) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-sm text-red-400">
        Missing ?file= query param
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <Toolbar />
      <main className="relative min-h-0 flex-1">
        <EditorStage src={src} />
      </main>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorInner />
    </Suspense>
  );
}
