import type { Metadata, Viewport } from "next";
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

// The canvas owns pinch-zoom (with a far wider range than the browser's), so
// the browser's own page zoom must not compete with it. This is the root
// layout, so it also covers the Tauri editor window, where it is inert.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

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
