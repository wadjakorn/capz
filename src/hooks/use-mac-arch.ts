"use client";

import { useEffect, useState } from "react";

export type MacArch = "arm" | "intel";

/**
 * Best-effort Mac chip detection. Chromium exposes it through User-Agent
 * Client Hints; Safari and Firefox don't, and their UA always says "Intel".
 * Returns null when unknown — callers then offer both downloads, Apple Silicon
 * first (every Mac sold since 2020 has it).
 */
export function useMacArch(): MacArch | null {
  const [arch, setArch] = useState<MacArch | null>(null);

  useEffect(() => {
    // @ts-expect-error userAgentData not in lib.dom yet
    const uad = navigator.userAgentData as
      | { getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> }
      | undefined;
    if (!uad?.getHighEntropyValues) return;
    let active = true;
    uad
      .getHighEntropyValues(["architecture"])
      .then(({ architecture }) => {
        if (!active || !architecture) return;
        setArch(architecture === "arm" ? "arm" : architecture === "x86" ? "intel" : null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return arch;
}
