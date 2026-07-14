import { describe, it, expect } from "vitest";
import { isImportableImagePath, IMPORT_IMAGE_EXTS } from "./importImage";

describe("isImportableImagePath", () => {
  it("accepts supported image extensions (case-insensitive)", () => {
    expect(isImportableImagePath("/tmp/shot.png")).toBe(true);
    expect(isImportableImagePath("C:\\Users\\me\\pic.JPG")).toBe(true);
    expect(isImportableImagePath("/a/b/photo.jpeg")).toBe(true);
    expect(isImportableImagePath("/x/anim.GIF")).toBe(true);
    expect(isImportableImagePath("/x/logo.webp")).toBe(true);
    expect(isImportableImagePath("/x/scan.bmp")).toBe(true);
  });

  it("rejects non-image and extensionless paths", () => {
    expect(isImportableImagePath("/tmp/notes.txt")).toBe(false);
    expect(isImportableImagePath("/tmp/archive.zip")).toBe(false);
    expect(isImportableImagePath("/tmp/pngfile")).toBe(false);
    expect(isImportableImagePath("/tmp/image.png.txt")).toBe(false);
  });

  it("matches only at the end of the path", () => {
    expect(isImportableImagePath("/tmp/png/report.doc")).toBe(false);
  });

  it("covers every advertised extension", () => {
    for (const ext of IMPORT_IMAGE_EXTS) {
      expect(isImportableImagePath(`/f/x.${ext}`)).toBe(true);
    }
  });
});
