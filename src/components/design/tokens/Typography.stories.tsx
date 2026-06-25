import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";

const scale: Array<[string, string, string]> = [
  ["--text-xs", "11px", "Labels, captions, eyebrows"],
  ["--text-sm", "12px", "Secondary text, codes"],
  ["--text-base", "14px", "Body — primary reading size"],
  ["--text-md", "16px", "Slightly larger body"],
  ["--text-lg", "18px", "Section headings inside cards"],
  ["--text-xl", "22px", "Card titles"],
  ["--text-2xl", "28px", "View headlines"],
];

export const Default: Story = () => (
  <GlassStage>
    <div className="grid gap-6 w-full">
      <div>
        <span className="eyebrow">EYEBROW · 11PX · UPPERCASE</span>
        <p className="text-xs mt-1" style={{ color: "var(--fg-3)" }}>.eyebrow / --text-xs</p>
      </div>
      {scale.map(([token, size, desc]) => (
        <div key={token}>
          <p style={{ fontSize: `var(${token})`, color: "var(--fg)" }}>
            {desc}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-3)" }}>
            {token} · {size}
          </p>
        </div>
      ))}
      <div className="headline" style={{ color: "var(--fg)" }}>
        Headline — .headline
        <p className="text-xs mt-1" style={{ color: "var(--fg-3)" }}>.headline / --text-2xl</p>
      </div>
      <div className="mt-4 grid gap-3 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>Thai sample · Noto Sans Thai</p>
        <p style={{ fontSize: "var(--text-base)", color: "var(--fg)" }}>
          สวัสดี · จับภาพหน้าจอแล้วเขียนคำอธิบายได้ทันที
        </p>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--fg)" }} className="font-semibold">
          สวัสดี · จับภาพหน้าจอ
        </p>
        <p style={{ fontSize: "var(--text-2xl)", color: "var(--fg)", lineHeight: 1.1 }} className="font-semibold">
          สวัสดี · จับภาพหน้าจอ
        </p>
      </div>
    </div>
  </GlassStage>
);
