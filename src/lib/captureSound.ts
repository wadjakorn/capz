/**
 * Short shutter-like tick via Web Audio API. No asset file needed.
 * Fires-and-forgets — safe to call without await. Errors swallowed (audio
 * context creation can fail under autoplay policies / locked-down envs).
 */
export function playCaptureSound() {
  try {
    type WindowWithWebkit = Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const w = window as WindowWithWebkit;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => void ctx.close();
  } catch (e) {
    console.warn("capture sound failed", e);
  }
}
