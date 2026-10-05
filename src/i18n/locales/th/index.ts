import type { TKey } from "../../store";
import { site } from "./site";
import { common } from "./common";
import { editor } from "./editor";
import { settings } from "./settings";
import { onboarding } from "./onboarding";
import { app } from "./app";

/** Typed against English so a missing translation fails `tsc`. */
export const th: Record<TKey, string> = {
  ...site,
  ...common,
  ...editor,
  ...settings,
  ...onboarding,
  ...app,
};
