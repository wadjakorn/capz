"use client";

import { useContext } from "react";
import { LanguageContext } from "./LanguageProvider";

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}
