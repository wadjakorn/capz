import type { Metadata } from "next";
import { Landing } from "@/components/site/Landing";

export const metadata: Metadata = {
  title: "capz — Free screen capture for macOS & Windows",
  description:
    "capz is a free, open-source native screen capture and recording app. An alternative to CleanShot and ShareX. macOS and Windows.",
  openGraph: {
    title: "capz",
    description: "Free, open-source screen capture for macOS and Windows.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function Home() {
  return <Landing />;
}
