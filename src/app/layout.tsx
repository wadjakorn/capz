import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeManager } from "@/components/ThemeManager";

const notoSansThai = localFont({
  src: "./fonts/NotoSansThai.ttf",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "capz",
  description: "Capture, annotate, share.",
};

// No `viewport` export here on purpose. Suppressing browser zoom is scoped to
// the route segments that own pinch-zoom themselves (src/app/paste/layout.tsx,
// src/app/editor/layout.tsx) so the landing page at `/` keeps it. See
// src/lib/canvasViewport.ts.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${notoSansThai.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeManager />
        {children}
      </body>
    </html>
  );
}
