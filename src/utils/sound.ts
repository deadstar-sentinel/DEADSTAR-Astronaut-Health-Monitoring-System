/**
 * Procedural HUD soundscape (Web Audio, no audio files). Off by default; browsers only
 * allow sound after a user gesture, so it starts from the header toggle.
 */
const KEY = "lifeline-sound";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;

try {
  enabled = localStorage.getItem(KEY) === "1";
} catch {
  enabled = false;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  if (on) sfx.ready();
}

export const sfx = {
  /** Crystalline tick for buttons. */
  click: () => tone(2400, 0.035, "sine", 0.22),
  /** Soft sonar ping: a stage or step advanced. */
  ping: () => {
    tone(880, 0.5, "sine", 0.35, 0, 660);
    tone(1320, 0.35, "sine", 0.12, 0.02);
  },
  /** Muted two-note warning (severe). */
  warn: () => {
    tone(523, 0.18, "triangle", 0.4);
    tone(392, 0.28, "triangle", 0.4, 0.2);
  },
  /** Urgent three-pulse chime (critical). */
  critical: () => {
    for (let i = 0; i < 3; i++) tone(740, 0.12, "square", 0.16, i * 0.16);
  },
  /** Rising resolve: back to normal. */
  recover: () => {
    tone(392, 0.22, "sine", 0.3);
    tone(523, 0.22, "sine", 0.3, 0.12);
    tone(784, 0.4, "sine", 0.28, 0.24);
  },
  /** Console keystroke / command accepted. */
  key: () => tone(1800, 0.02, "square", 0.05),
  ready: () => {
    tone(660, 0.12, "sine", 0.25);
    tone(990, 0.2, "sine", 0.22, 0.1);
  },
};
