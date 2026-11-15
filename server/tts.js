// Neural narration for LIFELINE: ElevenLabs (preferred) or Microsoft Azure Neural TTS.
// Keys stay on the server. Generated audio is cached in memory, so tour lines are paid for once.
import crypto from "node:crypto";

const MAX_CHARS = 900;
const CACHE_MAX = 300;
const cache = new Map(); // key -> Buffer (insertion-ordered LRU)

const ELEVEN_VOICES = {
  // Defaults are ElevenLabs premade voices; override with ELEVENLABS_VOICE_WARM / _DEEP.
  warm: () => process.env.ELEVENLABS_VOICE_WARM?.trim() || "EXAVITQu4vr4xnSDxMaL", // "Sarah": soft, warm
  deep: () => process.env.ELEVENLABS_VOICE_DEEP?.trim() || "nPczCjzI2devNBz1zQrb", // "Brian": deep, resonant
};
const AZURE_VOICES = {
  warm: () => process.env.AZURE_TTS_VOICE_WARM?.trim() || "en-US-AvaMultilingualNeural",
  deep: () => process.env.AZURE_TTS_VOICE_DEEP?.trim() || "en-US-AndrewMultilingualNeural",
};

/** Shortlists for the audition page. Only these IDs (or the env defaults) may be requested. */
export const SHORTLIST = {
  elevenlabs: [
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", persona: "warm", note: "Soft, warm, reassuring (recommended)" },
    { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", persona: "warm", note: "Friendly, gentle, inviting" },
    { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", persona: "warm", note: "Smooth, intimate, cinematic" },
    { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", persona: "warm", note: "Warm British, calm" },
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", persona: "warm", note: "Calm, clear, classic narrator" },
    { id: "nPczCjzI2devNBz1zQrb", name: "Brian", persona: "deep", note: "Deep, resonant, trustworthy (recommended)" },
    { id: "JBFqnCBsd6RHKfiVNtZT", name: "George", persona: "deep", note: "Warm British, storyteller" },
    { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", persona: "deep", note: "Authoritative, broadcast" },
    { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", persona: "deep", note: "Deep, firm, steady" },
    { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", persona: "deep", note: "Mature, wise, documentary" },
  ],
  azure: [
    { id: "en-US-AvaMultilingualNeural", name: "Ava", persona: "warm", note: "Warm, expressive (recommended)" },
    { id: "en-US-EmmaMultilingualNeural", name: "Emma", persona: "warm", note: "Bright, friendly" },
    { id: "en-US-JennyNeural", name: "Jenny", persona: "warm", note: "Clear, caring" },
    { id: "en-US-AriaNeural", name: "Aria", persona: "warm", note: "Confident, natural" },
    { id: "en-GB-SoniaNeural", name: "Sonia", persona: "warm", note: "Warm British" },
    { id: "en-US-AndrewMultilingualNeural", name: "Andrew", persona: "deep", note: "Warm, deep, trustworthy (recommended)" },
    { id: "en-US-BrianMultilingualNeural", name: "Brian", persona: "deep", note: "Relaxed, resonant" },
    { id: "en-US-DavisNeural", name: "Davis", persona: "deep", note: "Deep, calm" },
    { id: "en-US-GuyNeural", name: "Guy", persona: "deep", note: "Steady, broadcast" },
    { id: "en-GB-RyanNeural", name: "Ryan", persona: "deep", note: "Warm British" },
  ],
};

export function ttsProvider() {
  if (process.env.ELEVENLABS_API_KEY?.trim()) return "elevenlabs";
  if (process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim()) return "azure";
  return null;
}

const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

async function elevenlabs(text, persona, voiceId) {
  const voice = voiceId || ELEVEN_VOICES[persona]();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2",
      // Lower stability = more expressive delivery; style adds warmth.
      voice_settings: { stability: 0.38, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`ElevenLabs HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function azure(text, persona, voiceId) {
  const region = process.env.AZURE_SPEECH_REGION.trim();
  const voice = voiceId || AZURE_VOICES[persona]();
  const style = persona === "warm" ? "friendly" : "calm";
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
    `<voice name="${voice}"><mstts:express-as style="${style}"><prosody rate="-4%">${esc(text)}</prosody></mstts:express-as></voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY.trim(),
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "deadstar-lifeline",
    },
    body: ssml,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Azure TTS HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Returns MP3 audio for the text, or throws. */
export async function synthesize(rawText, rawPersona, rawVoice) {
  const provider = ttsProvider();
  if (!provider) throw new Error("no-provider");
  const text = String(rawText || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!text) throw new Error("empty");
  const persona = rawPersona === "deep" ? "deep" : "warm";
  // Only shortlisted voices may be requested from the browser.
  const voiceId = SHORTLIST[provider].some((v) => v.id === rawVoice) ? rawVoice : null;
  const key = crypto.createHash("sha1").update(`${provider}|${persona}|${voiceId}|${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const audio = provider === "elevenlabs" ? await elevenlabs(text, persona, voiceId) : await azure(text, persona, voiceId);
  cache.set(key, audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return audio;
}
