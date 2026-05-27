import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Default: Story = () => (
  <GlassStage>
  <div className="grid gap-6">
    <div>
      <span className="eyebrow">EYEBROW · 12PX · UPPERCASE</span>
      <p className="text-[11px] text-white/40">.eyebrow / --text-eyebrow</p>
    </div>
    <div>
      <p style={{ fontSize: "var(--text-body)" }} className="text-white">
        Body 14px — primary reading size. Used in dialogs, settings rows, captions.
      </p>
      <p className="text-[11px] text-white/40">--text-body 14px</p>
    </div>
    <div>
      <p
        style={{ fontSize: "var(--text-title)", letterSpacing: "var(--ls-snug)" }}
        className="font-semibold text-white"
      >
        Title 18px — section headings inside cards.
      </p>
      <p className="text-[11px] text-white/40">--text-title 18px</p>
    </div>
    <div>
      <h2 className="headline-xl">Headline 28px — view titles</h2>
      <p className="text-[11px] text-white/40">.headline-xl / --text-headline</p>
    </div>
    <div>
      <p
        style={{
          fontSize: "var(--text-display)",
          letterSpacing: "var(--ls-tight)",
          lineHeight: 1.05,
        }}
        className="font-semibold text-white"
      >
        Display 44px — hero
      </p>
      <p className="text-[11px] text-white/40">--text-display 44px</p>
    </div>
    <div className="mt-4 grid gap-3 border-t border-white/10 pt-6">
      <p className="text-[11px] uppercase tracking-wider text-white/40">Thai sample · Noto Sans Thai</p>
      <p style={{ fontSize: "var(--text-body)" }} className="text-white">
        สวัสดี · จับภาพหน้าจอแล้วเขียนคำอธิบายได้ทันที
      </p>
      <p
        style={{ fontSize: "var(--text-title)", letterSpacing: "var(--ls-snug)" }}
        className="font-semibold text-white"
      >
        สวัสดี · จับภาพหน้าจอ
      </p>
      <p
        style={{ fontSize: "var(--text-headline)", letterSpacing: "var(--ls-tight)", lineHeight: 1.1 }}
        className="font-semibold text-white"
      >
        สวัสดี · จับภาพหน้าจอ
      </p>
    </div>
  </div>
  </GlassStage>
);
