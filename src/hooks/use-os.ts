"use client";

import { useEffect, useState } from "react";

export type OS = "mac" | "windows" | "linux" | "other";

export function useOS(): OS {
  const [os, setOs] = useState<OS>("other");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const platform =
      // @ts-expect-error userAgentData not in lib.dom yet
      (navigator.userAgentData?.platform as string | undefined) ?? "";
    const s = `${ua} ${platform}`.toLowerCase();
    // Phones and tablets can't run the desktop app. iPhone UAs say "like Mac OS X",
    // and iPadOS reports a Mac UA but has touch points.
    const handheld = /iphone|ipad|ipod|android/.test(s) || (s.includes("mac") && navigator.maxTouchPoints > 1);
    if (handheld) setOs("other");
    else if (s.includes("mac")) setOs("mac");
    else if (s.includes("win")) setOs("windows");
    else if (s.includes("linux") && !s.includes("android")) setOs("linux");
    else setOs("other");
  }, []);

  return os;
}
