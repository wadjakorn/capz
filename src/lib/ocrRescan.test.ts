import { describe, expect, it } from "vitest";
import type { OcrLine, OcrWord } from "@/lib/ocr";
import { detScale, mergeRescan, paddedRegion } from "@/lib/ocrRescan";

// 2560×1600: detection scale 0.5, so a line is "small" below 32 px high.
const W = 2560;
const H = 1600;
const word = (text: string, x: number, y: number, w: number, h: number): OcrWord => ({
  text,
  bbox: { x, y, w, h },
});
const line = (words: OcrWord[]): OcrLine => {
  const x0 = Math.min(...words.map((w) => w.bbox.x));
  const y0 = Math.min(...words.map((w) => w.bbox.y));
  const x1 = Math.max(...words.map((w) => w.bbox.x + w.bbox.w));
  const y1 = Math.max(...words.map((w) => w.bbox.y + w.bbox.h));
  return { text: words.map((w) => w.text).join(" "), bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, words };
};
const REGION = { x: 800, y: 900, w: 800, h: 500 };
const texts = (ls: OcrLine[]) => ls.map((l) => l.text).sort();

describe("paddedRegion", () => {
  it("pads by max(32, 10% of the longer side) and clamps to the image", () => {
    expect(paddedRegion({ x: 100, y: 100, w: 200, h: 100 }, W, H)).toEqual({ x: 68, y: 68, w: 264, h: 164 });
    expect(paddedRegion({ x: 1000, y: 500, w: 1000, h: 200 }, W, H)).toEqual({ x: 900, y: 400, w: 1200, h: 400 });
    expect(paddedRegion({ x: 10, y: 1550, w: 100, h: 50 }, W, H)).toEqual({ x: 0, y: 1518, w: 142, h: 82 });
  });
});

describe("detScale", () => {
  it("is the detector's long-side scale, capped at 4x", () => {
    expect(detScale(2560, 1600)).toBe(0.5);
    expect(detScale(1280, 800)).toBe(1);
    expect(detScale(200, 100)).toBe(4);
  });
});

describe("mergeRescan", () => {
  const smallWhole = line([word("ไฟลตังค่า", 900, 1100, 200, 24), word("นริษัก", 1110, 1100, 120, 24)]);
  const smallCrop = line([word("ไฟล์ตั้งค่า", 902, 1104, 198, 17), word("บริษัท", 1112, 1104, 118, 17)]);

  it("adds a crop line that overlaps nothing", () => {
    const missed = line([word("missed", 900, 1200, 150, 17)]);
    expect(texts(mergeRescan([smallWhole], [missed], REGION, W, H))).toEqual(texts([smallWhole, missed]));
  });

  it("lets a crop line replace the words of a small whole-image line", () => {
    const out = mergeRescan([smallWhole], [smallCrop], REGION, W, H);
    expect(out).toEqual([smallCrop]);
  });

  it("keeps the whole-image words the crop line doesn't cover", () => {
    const longer = line([...smallWhole.words, word("tail", 1250, 1100, 60, 24)]);
    const out = mergeRescan([longer], [smallCrop], REGION, W, H);
    expect(texts(out)).toEqual(["tail", "ไฟล์ตั้งค่า บริษัท"]);
    expect(out.find((l) => l.text === "tail")!.bbox).toEqual({ x: 1250, y: 1100, w: 60, h: 24 });
  });

  it("discards a crop line over a large whole-image line", () => {
    const big = line([word("แอปแคปจอ", 900, 1000, 300, 41)]);
    const crop = line([word("อ", 880, 1004, 15, 30), word("แอปแคปจอสำหรับ", 900, 1004, 300, 30)]);
    expect(mergeRescan([big], [crop], REGION, W, H)).toEqual([big]);
  });

  it("discards a crop line overlapping both a small and a large line", () => {
    const big = line([word("Title", 900, 1090, 400, 40)]);
    expect(mergeRescan([smallWhole, big], [smallCrop], REGION, W, H)).toEqual([smallWhole, big]);
  });

  it("drops crop lines with fewer than 2 non-space characters", () => {
    const junk = [line([word("ั", 1000, 1200, 17, 19)]), line([word("T", 1040, 1200, 15, 17)])];
    expect(mergeRescan([], junk, REGION, W, H)).toEqual([]);
  });

  it("drops crop lines touching a cut edge of the region", () => {
    const cut = line([word("frag", 801, 1200, 80, 17)]); // left edge at 800, tolerance 8.5
    const inner = line([word("inner", 900, 1300, 80, 17)]);
    expect(mergeRescan([], [cut, inner], REGION, W, H)).toEqual([inner]);
  });

  it("keeps lines at an edge clamped by the image border", () => {
    const atBorder = { x: 0, y: 900, w: 800, h: 500 };
    const left = line([word("edge", 2, 1200, 80, 17)]);
    expect(mergeRescan([], [left], atBorder, W, H)).toEqual([left]);
  });
});
