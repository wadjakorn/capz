"use client";

import { useEffect, useState } from "react";

export type OS = "mac" | "windows" | "other";

export function useOS(): OS {
  const [os, setOs] = useState<OS>("other");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const platform =
      // @ts-expect-error userAgentData not in lib.dom yet
      (navigator.userAgentData?.platform as string | undefined) ?? "";
    const s = `${ua} ${platform}`.toLowerCase();
    if (s.includes("mac")) setOs("mac");
    else if (s.includes("win")) setOs("windows");
    else setOs("other");
  }, []);

  return os;
}
