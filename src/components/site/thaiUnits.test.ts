import { describe, expect, it } from "vitest";
import { BREAK, splitUnits } from "./thaiUnits";

describe("splitUnits", () => {
  it("keeps an unspaced Thai heading as one unit", () => {
    expect(splitUnits("แต่งพื้นหลัง")).toEqual([{ text: "แต่งพื้นหลัง", space: false }]);
  });
  it("breaks at explicit U+200B markers without adding a space", () => {
    expect(splitUnits(`เครื่องมือข้อความ${BREAK}ที่เข้าใจภาษาไทย`)).toEqual([
      { text: "เครื่องมือข้อความ", space: false },
      { text: "ที่เข้าใจภาษาไทย", space: false },
    ]);
  });
  it("breaks at spaces and remembers them", () => {
    expect(splitUnits("ทั้งจอ ในครั้งเดียว")).toEqual([
      { text: "ทั้งจอ", space: true },
      { text: "ในครั้งเดียว", space: false },
    ]);
  });
  it("collapses runs of separators and trims the ends", () => {
    expect(splitUnits(`  a ${BREAK} b${BREAK}`)).toEqual([
      { text: "a", space: true },
      { text: "b", space: false },
    ]);
    expect(splitUnits("")).toEqual([]);
  });
});
