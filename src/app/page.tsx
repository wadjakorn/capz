import type { Metadata } from "next";
import { Landing } from "@/components/site/Landing";
import { site as th } from "@/i18n/locales/th/site";

// Static export: metadata can't follow the in-page TH/EN switch, so it leads in Thai (the default).
export const metadata: Metadata = {
  title: th["meta.title"],
  description: th["meta.desc"],
  openGraph: {
    title: "capz",
    description: th["meta.desc"],
    type: "website",
    locale: "th_TH",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function Home() {
  return <Landing />;
}
