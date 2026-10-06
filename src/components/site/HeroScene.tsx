"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { SpecimenHero, type SpecimenLayers } from "./SpecimenHero";
import { HERO_CLIPS } from "./shots";
import { useT } from "@/i18n/useT";
import { useOS } from "@/hooks/use-os";
import { useLatestRelease } from "@/hooks/use-latest-release";
import { cameraAt, cameraTransform, viewportRect } from "@/lib/heroCamera";
import { heroSegments, locateSegment, type Segment } from "@/lib/heroSegments";
import { ThaiText } from "./ThaiText";

const BREW_CMD = "brew install wadjakorn/capz/capz";
const RISE_VH = 90;
const PER_CLIP_VH = 60;
type Mode = "scrub" | "playlist" | "poster";

/**
 * The hero as a scroll scene. Wide screens with a mouse or trackpad scrub the
 * clips with scroll (sticky stage: specimen parallax → editor window rises →
 * scroll split across the clips by duration). Phones and touch get a normal
 * page flow with an autoplay playlist and a guided camera; reduced motion gets
 * posters and a play button. `?mode=scrub|playlist|poster` forces a mode.
 */
export function HeroScene() {
  const { t } = useT();
  const os = useOS();
  const { version, windowsAssetUrl } = useLatestRelease();
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("poster");
  const [copied, setCopied] = useState(false);

  const secRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const vidRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const layersRef = useRef<SpecimenLayers | null>(null);
  const api = useRef<{ jump: (i: number) => void; play: () => void; tick: () => void } | null>(null);

  const onLayers = useCallback((l: SpecimenLayers | null) => {
    layersRef.current = l;
    api.current?.tick();
  }, []);

  useEffect(() => {
    const sec = secRef.current!, stage = stageRef.current!, copyEl = copyRef.current!, demo = demoRef.current!;
    const body = bodyRef.current!, mini = miniRef.current!, chips = chipsRef.current!;
    const vids = vidRefs.map((r) => r.current!) as [HTMLVideoElement, HTMLVideoElement];
    const header = document.querySelector<HTMLElement>(".site-landing .index");
    const N = HERO_CLIPS.length;
    const phoneMq = matchMedia("(max-width: 760px)");
    const fineMq = matchMedia("(any-pointer: fine)");
    const rmMq = matchMedia("(prefers-reduced-motion: reduce)");
    const sm = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const blobs = new Map<string, Promise<string>>();
    const durs = HERO_CLIPS.map((c) => c.duration);
    let mode: Mode = "poster", isPhone = false, sh = 0, fh = 0, R = 0.5, ticking = false, inView = false;
    let segs: Segment[] = heroSegments(durs);
    let cur = -1, front = 0, dir = 1, raf = 0, lastCam = "";
    let io: IntersectionObserver | null = null;
    const meta = new WeakMap<HTMLVideoElement, { key: string; clip: number; at: number; pending: number | null }>();
    vids.forEach((v) => meta.set(v, { key: "", clip: -1, at: 0, pending: null }));

    const navH = () => header?.offsetHeight ?? 57;
    const fill = (i: number, f: number) => [...chips.children].forEach((b, j) => (b as HTMLElement).style.setProperty("--fill", String(j < i ? 1 : j === i ? f.toFixed(3) : 0)));
    const mark = (i: number) => [...chips.children].forEach((b, j) => b.setAttribute("aria-current", String(j === i)));

    // scrubbing needs a fully seekable source; only the clips actually shown (current + next) are fetched
    const urlFor = (i: number) => {
      const u = HERO_CLIPS[i].src;
      if (mode !== "scrub") return Promise.resolve(u);
      if (!blobs.has(u)) blobs.set(u, fetch(u).then((r) => r.blob()).then((b) => URL.createObjectURL(b)).catch(() => u));
      return blobs.get(u)!;
    };
    const load = (slot: number, i: number): Promise<HTMLVideoElement> => {
      const v = vids[slot], m = meta.get(v)!, key = `${i}|${mode}`;
      const ready = () => (v.readyState >= 2 ? Promise.resolve(v) : new Promise<HTMLVideoElement>((res) => v.addEventListener("loadeddata", () => res(v), { once: true })));
      if (m.key === key) return ready();
      m.key = key; m.clip = i; v.poster = HERO_CLIPS[i].poster;
      return urlFor(i).then((u) => {
        if (m.key !== key) return v;
        v.preload = "auto"; v.src = u; v.load();
        return ready();
      });
    };
    const show = (i: number): Promise<HTMLVideoElement> => {
      if (i === cur) return Promise.resolve(vids[front]);
      dir = i > cur ? 1 : -1; cur = i; mark(i); setActive(i);
      const slot = meta.get(vids[front])!.clip === i && meta.get(vids[front])!.key ? front : 1 - front;
      return load(slot, i).then((v) => {
        if (cur !== i) return v;
        if (slot !== front) { vids[front].pause(); vids[slot].classList.add("on"); vids[front].classList.remove("on"); front = slot; }
        const nb = mode === "scrub" ? i + dir : (i + 1) % N;
        if (N > 1 && nb >= 0 && nb < N && mode !== "poster") window.setTimeout(() => { if (cur === i) load(1 - front, nb); }, 260);
        return v;
      });
    };
    const seek = (v: HTMLVideoElement, tm: number) => {
      const m = meta.get(v)!;
      if (v.seeking) { m.pending = tm; return; }
      if (Math.abs(v.currentTime - tm) > 0.03) { m.at = performance.now(); v.currentTime = tm; }
    };
    const onSeeked = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement, m = meta.get(v)!;
      if (mode === "scrub" && m.pending != null) { const tm = m.pending; m.pending = null; seek(v, tm); }
    };
    const onTime = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement;
      if (mode !== "scrub" && v === vids[front] && v.duration) fill(cur, v.currentTime / v.duration);
    };
    const onEnded = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement;
      if (v !== vids[front]) return;
      if (mode === "playlist") show((cur + 1) % N).then((n) => { n.currentTime = 0; if (inView) n.play().catch(() => {}); });
    };
    vids.forEach((v) => { v.addEventListener("seeked", onSeeked); v.addEventListener("timeupdate", onTime); v.addEventListener("ended", onEnded); });

    const layout = () => {
      sec.style.setProperty("--navh", `${navH()}px`);
      if (mode !== "scrub") return;
      sh = stage.clientHeight;
      const fw = Math.min(innerWidth * 0.9, ((sh - 34 - 168) * 16) / 10);
      demo.style.setProperty("--fw", `${fw}px`);
      fh = (fw * 10) / 16 + 34 + 150;
    };
    const apply = (p: number) => {
      const pp = Math.min(1, p / R);
      const L = layersRef.current;
      if (L) {
        L.lv.style.transform = `translate3d(0, ${-pp * 0.06 * sh}px, 0)`;
        L.gl.style.transform = `translate3d(0, ${-pp * 0.14 * sh}px, 0)`;
        L.an.style.transform = `translate3d(0, ${-pp * 0.26 * sh}px, 0)`;
        const ps = 1 + 0.15 * sm(pp / 0.9);
        for (const w of L.pins) w.style.transform = `scale(${ps})`;
      }
      const f = sm((pp - 0.36) / 0.55);
      copyEl.style.opacity = String(1 - f);
      copyEl.style.transform = `translate3d(0, ${-f * 90}px, 0)`;
      copyEl.style.pointerEvents = f > 0.6 ? "none" : "";
      const q = sm(pp), y0 = sh - 46, y1 = Math.max(10, (sh - fh) / 2);
      demo.style.transform = `translate3d(-50%, ${y0 + (y1 - y0) * q}px, 0) scale(${0.62 + 0.38 * q})`;
      const { index, local } = locateSegment(segs, (p - R) / (1 - R));
      fill(index, local);
      show(index).then((v) => { if (cur === index && v === vids[front] && v.duration) seek(v, local * (v.duration - 0.04)); });
    };
    const tick = () => {
      ticking = false;
      if (mode !== "scrub") return;
      const r = sec.getBoundingClientRect(), total = r.height - sh;
      apply(total > 0 ? Math.min(1, Math.max(0, (navH() - r.top) / total)) : 0);
    };
    const onScroll = () => { if (mode === "scrub" && !ticking) { ticking = true; requestAnimationFrame(tick); } };

    // guided camera: on narrow frames follow the clip's point of action instead of shrinking it whole
    const camera = () => {
      raf = requestAnimationFrame(camera);
      const v = vids[front], w = body.clientWidth, h = body.clientHeight;
      const on = mode !== "poster" && w > 0 && w < 760 && !document.fullscreenElement && cur >= 0;
      const view = on ? cameraAt(HERO_CLIPS[cur].camera, v.currentTime || 0) : { x: 0.5, y: 0.5, s: 1 };
      const { tx, ty, s } = cameraTransform(view, w, h);
      const key = `${front}|${tx.toFixed(1)}|${ty.toFixed(1)}|${s.toFixed(3)}`;
      if (key === lastCam) return;
      lastCam = key;
      v.style.transform = s > 1.001 ? `translate3d(${tx}px, ${ty}px, 0) scale(${s})` : "";
      vids[1 - front].style.transform = "";
      mini.hidden = s <= 1.02;
      if (!mini.hidden) {
        const r = viewportRect(view, w, h), box = mini.firstElementChild as HTMLElement;
        Object.assign(box.style, { left: `${r.left * 100}%`, top: `${r.top * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
      }
    };
    raf = requestAnimationFrame(camera);

    const configure = () => {
      isPhone = phoneMq.matches;
      const qm = new URLSearchParams(location.search).get("mode");
      mode = qm === "scrub" || qm === "playlist" || qm === "poster" ? qm
        : rmMq.matches ? "poster" : !isPhone && fineMq.matches ? "scrub" : "playlist";
      setMode(mode);
      const flow = mode !== "scrub";
      sec.classList.toggle("flow", flow);
      sec.classList.toggle("phone", isPhone);
      sec.style.height = flow ? "" : `calc(100vh + ${RISE_VH + PER_CLIP_VH * N}vh)`;
      R = RISE_VH / (RISE_VH + PER_CLIP_VH * N);
      if (flow) {
        for (const n of [copyEl, demo]) { n.style.transform = ""; n.style.opacity = ""; n.style.pointerEvents = ""; }
        const L = layersRef.current;
        if (L) [L.lv, L.gl, L.an, ...L.pins].forEach((n) => (n.style.transform = ""));
      }
      io?.disconnect(); io = null;
      vids.forEach((v) => { v.pause(); v.loop = false; v.controls = false; meta.get(v)!.key = ""; });
      cur = -1; segs = heroSegments(durs); layout();
      if (mode === "poster") { api.current?.jump(0); return; }
      if (mode === "playlist") {
        io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; const v = vids[front]; if (inView) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.35 });
        io.observe(demo);
        show(0).then((v) => { if (inView) v.play().catch(() => {}); });
      } else tick();
    };

    api.current = {
      tick: () => { layout(); tick(); },
      jump: (i: number) => {
        if (mode === "scrub") {
          const total = sec.offsetHeight - sh;
          const top = sec.getBoundingClientRect().top + scrollY - navH();
          scrollTo({ top: top + (R + (1 - R) * (segs[i].a + 0.004)) * total + 1 });
        } else if (mode === "playlist") {
          show(i).then((v) => { v.currentTime = 0; v.play().catch(() => {}); });
        } else {
          const v = vids[front];
          cur = i; mark(i); fill(i, 0); setActive(i);
          v.removeAttribute("src"); v.load(); v.poster = HERO_CLIPS[i].poster; v.controls = false;
          meta.get(v)!.key = "";
        }
      },
      play: () => {
        const i = Math.max(cur, 0);
        load(front, i).then((v) => { v.controls = true; v.currentTime = 0; v.play().catch(() => {}); });
      },
    };

    // tap the frame on phones → the uncropped clip, fullscreen, landscape if allowed
    const onTap = async (e: MouseEvent) => {
      if ((e.target as Element).closest(".play") || !isPhone || mode !== "playlist") return;
      const v = vids[front] as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      try {
        if (v.requestFullscreen) await v.requestFullscreen();
        else v.webkitEnterFullscreen?.();
        try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"); } catch { /* not allowed here */ }
        v.play().catch(() => {});
      } catch { /* fullscreen refused */ }
    };
    body.addEventListener("click", onTap);
    addEventListener("scroll", onScroll, { passive: true });
    let rt = 0;
    const onResize = () => { window.clearTimeout(rt); rt = window.setTimeout(() => { layout(); tick(); }, 120); };
    addEventListener("resize", onResize);
    const mqs = [phoneMq, fineMq, rmMq];
    mqs.forEach((q) => q.addEventListener("change", configure));
    configure();

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      body.removeEventListener("click", onTap);
      mqs.forEach((q) => q.removeEventListener("change", configure));
      vids.forEach((v) => { v.removeEventListener("seeked", onSeeked); v.removeEventListener("timeupdate", onTime); v.removeEventListener("ended", onEnded); v.pause(); });
      blobs.forEach((p) => p.then((u) => u.startsWith("blob:") && URL.revokeObjectURL(u)));
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(BREW_CMD); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const clip = HERO_CLIPS[active];

  return (
    <section className="scene" id="top" ref={secRef} aria-labelledby="hero-title">
      <div className="stage" ref={stageRef}>
        <div className="wrap scene-copy" ref={copyRef}>
          <SpecimenHero onLayers={onLayers} />
          <div className="hero-body">
            <div>
              <h1 id="hero-title">
                <ThaiText>{t("hero.title1")}</ThaiText> <span className="hl"><ThaiText>{t("hero.title2")}</ThaiText></span>
              </h1>
              <p className="lede">{t("hero.desc")}</p>
            </div>
            <div className="install-cta">
              {os === "windows" ? (
                <>
                  <a className="btn btn-primary" href={windowsAssetUrl}>{t("hero.downloadWin")}<ArrowRight aria-hidden /></a>
                  <div className="row">
                    <a className="btn btn-quiet" href="/paste">{t("hero.tryWeb")}</a>
                    <a className="link" href="#install">{t("hero.installMac")}</a>
                  </div>
                </>
              ) : (
                <>
                  <span className="mono k">{t("hero.installMac")}</span>
                  <div className="cmd">
                    <code>{BREW_CMD}</code>
                    <button className="btn btn-copy" type="button" onClick={copy} aria-label={t("hero.copyCmd")} data-done={copied || undefined}>
                      {copied ? t("hero.copied") : t("hero.copy")}
                    </button>
                  </div>
                  <div className="row">
                    <a className="btn btn-primary" href="/paste">{t("hero.tryWeb")}<ArrowRight aria-hidden /></a>
                    <a className="link" href={windowsAssetUrl}>{t("hero.downloadWin")}</a>
                  </div>
                </>
              )}
              <div className="ver mono"><i aria-hidden />{version ? `${version} · ${t("hero.latest")}` : t("hero.latest")}</div>
              <ul className="proofstrip" aria-label={t("hero.proof")}>
                <li>{t("hero.proof.free")}</li>
                <li>{t("hero.proof.oss")}</li>
                <li>macOS + Windows</li>
                <li>{t("hero.proof.noAds")}</li>
                <li>{t("hero.proof.privacy")}</li>
              </ul>
            </div>
          </div>
        </div>

        <figure className="demo" ref={demoRef}>
          <div className="win" role="img" aria-label={t("site.clip.aria")}>
            <div className="win-bar" aria-hidden><i /><i /><i /><span>capz</span></div>
            <div className="win-body" ref={bodyRef}>
              <video ref={vidRefs[0]} className="on" muted playsInline preload="none" poster={HERO_CLIPS[0].poster} aria-hidden />
              <video ref={vidRefs[1]} muted playsInline preload="none" aria-hidden />
              <div className="minimap" ref={miniRef} hidden aria-hidden><i /></div>
              {mode === "poster" && (
                <button className="play" type="button" onClick={(e) => { (e.currentTarget as HTMLButtonElement).hidden = true; api.current?.play(); }}>
                  <Play aria-hidden /><span className="sr">{t("site.clip.play")}</span>
                </button>
              )}
            </div>
          </div>
          <p className="clipcap" aria-live="polite"><ThaiText>{t(clip.caption)}</ThaiText></p>
          <div className="chips" role="group" aria-label={t("site.clip.chapters")} ref={chipsRef}>
            {HERO_CLIPS.map((c, i) => (
              <button key={c.id} type="button" className="chip-btn" aria-current={i === active} onClick={() => api.current?.jump(i)}>
                <span><b>{i + 1}</b><ThaiText>{t(c.label)}</ThaiText></span>
              </button>
            ))}
          </div>
          <figcaption>{t("site.clip.note")}</figcaption>
        </figure>
      </div>
    </section>
  );
}
