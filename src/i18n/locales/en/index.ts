import { site } from "./site";
import { common } from "./common";
import { editor } from "./editor";
import { settings } from "./settings";
import { onboarding } from "./onboarding";
import { app } from "./app";

/** English is the source of truth: its keys define `TKey`. */
export const en = {
  ...site,
  ...common,
  ...editor,
  ...settings,
  ...onboarding,
  ...app,
};
