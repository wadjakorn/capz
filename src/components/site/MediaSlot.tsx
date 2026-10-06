"use client";

import { EditorFrame } from "./EditorFrame";
import { SLOTS, type SlotId } from "./shots";
import { useT } from "@/i18n/useT";

/**
 * A shot from SHOTS.md. Until `ready` is flipped in shots.ts the designed
 * placeholder (slot id + one line on what the shot will show) stands in,
 * framed the way the real shot will be.
 */
export function MediaSlot({ id, frame = "editor", caption = true }: { id: SlotId; frame?: "editor" | "phone" | "bare"; caption?: boolean }) {
  const { t } = useT();
  const slot = SLOTS[id];
  const line = t(slot.line);
  const media = slot.ready ? (
    slot.video ? (
      <video className="shot" src={`/landing/${id}.mp4`} muted playsInline autoPlay loop preload="metadata" aria-label={line} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="shot" src={`/landing/${id}.webp`} alt={line} loading="lazy" decoding="async" />
    )
  ) : (
    <div className="ph-img">
      <div>
        <div className="ph-id">{id}</div>
        <div className="ph-line">{line}</div>
      </div>
    </div>
  );
  return (
    <figure className={`slot slot--${frame}`}>
      {frame === "editor" ? (
        <EditorFrame tool={slot.tool} label={line}>{media}</EditorFrame>
      ) : (
        <div className={frame === "phone" ? "phone-frame" : "bare"} style={{ aspectRatio: slot.aspect }} role={slot.ready ? undefined : "img"} aria-label={slot.ready ? undefined : line}>
          {media}
        </div>
      )}
      {caption && !slot.ready && (
        <figcaption>
          <b>{id}</b>
          <span>{t("site.slot.pending")}</span>
        </figcaption>
      )}
    </figure>
  );
}
