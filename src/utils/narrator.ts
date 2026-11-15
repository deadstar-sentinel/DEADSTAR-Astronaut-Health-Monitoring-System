/**
 * LIFELINE's voice: the warmest natural voice the device offers, via the Web Speech API.
 * No audio files or keys. Quality depends on the browser: Edge and Chrome ship neural
 * "Natural"/"Online" voices, Safari has Samantha/Ava. Long lines are spoken sentence by
 * sentence (Chrome stops very long utterances), and every call resolves even if speech fails.
 */

export type VoicePersona = "warm" | "deep";

/** Deep, steady male voices, best first. */
const DEEP = [
  /Andrew.*(Natural|Online)/i,
  /Guy.*(Natural|Online)/i,
  /Brian.*(Natural|Online)/i,
  /Christopher.*(Natural|Online)/i,
  /Ryan.*(Natural|Online)/i,
  /Davis.*(Natural|Online)/i,
  /Daniel/i,
  /Google UK English Male/i,
  /\bAlex\b|Arthur|Aaron|Fred/i,
  /David|Mark|George/i,
];

const TUNING: Record<VoicePersona, { rate: number; pitch: number }> = {
  warm: { rate: 0.95, pitch: 1.05 },
  deep: { rate: 0.93, pitch: 0.9 },
};

let persona: VoicePersona = (() => {
  try {
    return localStorage.getItem("lifeline-voice") === "deep" ? "deep" : "warm";
  } catch {
    return "warm";
  }
})();

export function getPersona(): VoicePersona {
  return persona;
}

export function setPersona(p: VoicePersona) {
  persona = p;
  chosen = null;
  try {
    localStorage.setItem("lifeline-voice", p);
  } catch {
    /* private mode */
  }
}

/** The ranked shortlist for each persona (shown to the team; first match on a device wins). */
export const VOICE_SHORTLIST: Record<VoicePersona, string[]> = {
  warm: ["Aria (Natural)", "Jenny (Natural)", "Ava", "Emma (Natural)", "Libby (Natural)", "Sonia (Natural)", "Natasha (Natural)", "any Natural/Neural voice", "Samantha", "Google UK English Female"],
  deep: ["Andrew (Natural)", "Guy (Natural)", "Brian (Natural)", "Christopher (Natural)", "Ryan (Natural)", "Davis (Natural)", "Daniel", "Google UK English Male", "Alex / Arthur / Aaron"],
};

/** Voices that sound warm and natural, best first. Matched against voice names. */
const PREFERRED = [
  /Aria.*(Natural|Online)/i,
  /Jenny.*(Natural|Online)/i,
  /Ava.*(Natural|Online|Premium|Enhanced)?/i,
  /Emma.*(Natural|Online)/i,
  /Libby.*(Natural|Online)/i,
  /Sonia.*(Natural|Online)/i,
  /Natasha.*(Natural|Online)/i,
  /(Natural|Neural|Online)/i,
  /Samantha/i,
  /Google UK English Female/i,
  /Google US English/i,
  /Serena|Karen|Moira|Tessa|Zira/i,
];

let chosen: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function voiceSupported(): boolean {
  return synth() !== null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  if (chosen) return chosen;
  const voices = s.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  for (const re of persona === "deep" ? DEEP : PREFERRED) {
    const v = voices.find((x) => re.test(x.name));
    if (v) return (chosen = v);
  }
  return (chosen = voices[0] ?? null);
}

// Voices load asynchronously in some browsers.
if (synth()) {
  synth()!.onvoiceschanged = () => {
    chosen = null;
    pickVoice();
  };
}

export function voiceName(): string | null {
  return pickVoice()?.name ?? null;
}

let generation = 0;

/* ---- Neural voice (ElevenLabs / Azure via the server); browser voice is only a fallback ---- */
let neural: Promise<string | null> | null = null;
const audioCache = new Map<string, Promise<string | null>>(); // key -> object URL
let player: HTMLAudioElement | null = null;

export function neuralProvider(): Promise<string | null> {
  if (!neural) {
    neural = fetch("/api/tts/status")
      .then((r) => (r.ok ? r.json() : { provider: null }))
      .then((j: { provider: string | null }) => j.provider)
      .catch(() => null);
  }
  return neural;
}

function audioFor(text: string): Promise<string | null> {
  const key = `${persona}|${text}`;
  let p = audioCache.get(key);
  if (!p) {
    p = fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, persona }) })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b && b.size > 0 ? URL.createObjectURL(b) : null))
      .catch(() => null);
    audioCache.set(key, p);
    p.then((u) => {
      if (!u) audioCache.delete(key);
    });
  }
  return p;
}

/** Fetch a line ahead of time so the next shot starts speaking instantly. */
export function prefetch(text: string) {
  void neuralProvider().then((prov) => {
    if (prov) void audioFor(text);
  });
}

/** Call inside a click/tap: lets phones play narration later in the same session. */
export function unlockAudio() {
  if (!player) player = new Audio();
  player.muted = true;
  player.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  void player.play().then(() => player && player.pause()).catch(() => {});
  void neuralProvider();
}

function playNeural(url: string, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (!player) player = new Audio();
    const a = player;
    a.muted = false;
    a.src = url;
    let guard = 0;
    const done = () => {
      window.clearTimeout(guard);
      a.onended = null;
      a.onerror = null;
      resolve();
    };
    a.onended = done;
    a.onerror = done;
    guard = window.setTimeout(done, 60000);
    a.play().catch(done);
    const check = window.setInterval(() => {
      if (my !== generation) {
        window.clearInterval(check);
        a.pause();
        done();
      } else if (a.ended) window.clearInterval(check);
    }, 150);
  });
}

/** Speak text warmly: neural voice when the server has one, browser voice otherwise. */
export async function speak(text: string): Promise<void> {
  if (!text.trim()) return;
  const my = ++generation;
  synth()?.cancel();
  player?.pause();
  if (await neuralProvider()) {
    const url = await audioFor(text);
    if (my !== generation) return;
    if (url) return playNeural(url, my);
  }
  return speakBrowser(text, my);
}

function speakBrowser(text: string, my: number): Promise<void> {
  const s = synth();
  if (!s) return Promise.resolve();
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
  const voice = pickVoice();
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (my !== generation || i >= sentences.length) return resolve();
      const u = new SpeechSynthesisUtterance(sentences[i++]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-US";
      u.rate = TUNING[persona].rate;
      u.pitch = TUNING[persona].pitch;
      u.volume = 1;
      // Safety net: some browsers never fire `end` (backgrounded tab, no audio device).
      const guard = window.setTimeout(next, Math.max(2500, u.text.length * 85));
      u.onend = () => {
        window.clearTimeout(guard);
        window.setTimeout(next, 120);
      };
      u.onerror = () => {
        window.clearTimeout(guard);
        next();
      };
      s.speak(u);
    };
    next();
  });
}

export function stopSpeaking() {
  generation++;
  synth()?.cancel();
  player?.pause();
}

/* ------------------------------------------------------------------ listening */

interface MinimalRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => MinimalRecognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => MinimalRecognition; webkitSpeechRecognition?: new () => MinimalRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function listeningSupported(): boolean {
  return typeof window !== "undefined" && recognitionCtor() !== null;
}

/** Listen for one spoken command. Calls back with the transcript, or null on error/silence. */
export function listenOnce(onText: (text: string | null, error?: string) => void): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onText(null, "unsupported");
    return () => {};
  }
  const r = new Ctor();
  let done = false;
  r.lang = "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    done = true;
    onText(e.results[0]?.[0]?.transcript ?? null);
  };
  r.onerror = (e) => {
    if (done) return;
    done = true;
    onText(null, e.error);
  };
  r.onend = () => {
    if (!done) onText(null, "no-speech");
  };
  try {
    r.start();
  } catch {
    onText(null, "busy");
  }
  return () => {
    try {
      r.stop();
    } catch {
      /* already stopped */
    }
  };
}
