"use client";

import { LanguageProvider } from "@/i18n/LanguageProvider";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { Features } from "./Features";
import { Install } from "./Install";
import { Footer } from "./Footer";

/**
 * Marketing landing page — ported from the standalone capz-site (Cloudflare
 * Worker). Wrapped in `.site-landing` which forces the dark graphite palette so
 * it renders correctly regardless of the app's active theme.
 */
export function Landing() {
  return (
    <LanguageProvider>
      <div className="site-landing text-foreground">
        <Nav />
        <main>
          <Hero />
          <Features />
          <Install />
        </main>
        <Footer />
      </div>
    </LanguageProvider>
  );
}
