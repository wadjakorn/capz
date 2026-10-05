import { test as base, expect } from "@playwright/test";

/**
 * Every spec imports `test` from here instead of `@playwright/test`. The app
 * defaults to Thai, but the specs assert English copy, so pin the UI to
 * English (see `pinnedLang` in src/i18n/store.ts). The first render still
 * matches the Thai prerendered HTML and LanguageManager flips to English right
 * after hydration, so `goto` also waits for that flip (`<html lang="en">`) —
 * otherwise a spec that probes with a non-waiting `isVisible()` races it.
 * Specs that exercise language switching import `unpinnedTest` instead.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as { __CAPZ_PIN_LANG__?: string }).__CAPZ_PIN_LANG__ = "en";
    });
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const res = await goto(url, options);
      await page.waitForFunction(() => document.documentElement.lang === "en");
      return res;
    };
    await use(page);
  },
});

export const unpinnedTest = base;
export { expect };
