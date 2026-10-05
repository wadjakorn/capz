"use client";

import type { ReactNode } from "react";

/**
 * Kept for the landing page's tree. Language now lives in the global i18n
 * store (src/i18n/store.ts) so lib modules can translate too; this wrapper
 * only exists so the site components need no restructuring.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
