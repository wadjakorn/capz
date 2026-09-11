"use client";

import type { LucideIcon } from "lucide-react";
import { create } from "zustand";

/**
 * What the sidebar's contextual panel is currently showing, published by
 * Toolbar.
 *
 * The sidebar used to be a bare portal target that three components rendered
 * into, each deciding for itself with mutually-exclusive conditions. Tabs make
 * that decision shared state — something has to know whether a third,
 * contextual tab exists and what to call it — so Toolbar, which already
 * computes exactly that, says so out loud instead of only acting on it.
 *
 * Deliberately tiny and never persisted: it is a description of the current
 * render, not user data.
 */
export type ToolPanelInfo = {
  /** Stable key for the panel — the tool id, or the selected annotation's type. */
  key: string;
  /** Human label for the tab's tooltip and the panel heading. */
  label: string;
  icon: LucideIcon;
};

type State = {
  toolPanel: ToolPanelInfo | null;
  setToolPanel: (info: ToolPanelInfo | null) => void;
};

export const useSidebar = create<State>((set) => ({
  toolPanel: null,
  setToolPanel: (info) =>
    set((prev) => {
      // Compare by key so a re-render with an equivalent descriptor doesn't
      // churn subscribers — the editor page keys tab transitions off this.
      if (prev.toolPanel?.key === info?.key) return prev;
      return { toolPanel: info };
    }),
}));
