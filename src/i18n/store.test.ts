import { afterEach, describe, expect, it } from "vitest";
import { dictionaries, t, translate, useI18n, type TKey } from "./store";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  const enKeys = Object.keys(dictionaries.en) as TKey[];

  it("Thai has exactly the English keys", () => {
    expect(Object.keys(dictionaries.th).sort()).toEqual([...enKeys].sort());
  });

  it("no translation is empty", () => {
    for (const k of enKeys) {
      expect(dictionaries.en[k].trim(), `en ${k}`).not.toBe("");
      expect(dictionaries.th[k].trim(), `th ${k}`).not.toBe("");
    }
  });

  it("both languages use the same {placeholders}", () => {
    for (const k of enKeys) {
      expect(placeholders(dictionaries.th[k]), k).toEqual(placeholders(dictionaries.en[k]));
    }
  });

  it("every key carries a namespace prefix", () => {
    const ns = /^(site\.|nav\.|hero\.|features\.|install\.|footer\.|meta\.|common\.|editor\.|settings\.|onboarding\.|app\.)/;
    for (const k of enKeys) expect(k, k).toMatch(ns);
  });
});

describe("translate / t", () => {
  afterEach(() => useI18n.setState({ lang: "en" }));

  it("substitutes every occurrence of a placeholder", () => {
    expect(translate("en", "footer.copyright", { year: 2026 })).toBe("© 2026 capz");
  });

  it("t follows the store's language", () => {
    useI18n.setState({ lang: "th" });
    expect(t("hero.tryWeb")).toBe(dictionaries.th["hero.tryWeb"]);
    useI18n.setState({ lang: "en" });
    expect(t("hero.tryWeb")).toBe(dictionaries.en["hero.tryWeb"]);
  });

  it("falls back to the key for an unknown key", () => {
    expect(translate("th", "nope.missing" as TKey)).toBe("nope.missing");
  });
});
