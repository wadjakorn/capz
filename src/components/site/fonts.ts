import { Chonburi } from "next/font/google";

/** Display face for the landing only (specimen glyphs and headings). */
export const chonburi = Chonburi({
  weight: "400",
  subsets: ["thai", "latin"],
  variable: "--font-display",
  display: "swap",
});
