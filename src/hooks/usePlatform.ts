"use client";

import { useEffect, useState } from "react";
import { currentPlatform, type Platform } from "@/lib/shortcuts";

/**
 * The platform for shortcut glyphs (⌘ vs Ctrl). navigator is absent during
 * prerender, so this pins to the prerender value ("win") until mounted to
 * avoid a hydration mismatch, then switches to the real platform.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("win");
  useEffect(() => setPlatform(currentPlatform()), []);
  return platform;
}
