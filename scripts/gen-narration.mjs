// Pre-generate every LIFELINE narration line with Microsoft's Sonia neural voice (en-GB),
// the same voice as the team's animated film. Free, no key; runs once, files ship with the app.
// Usage: node scripts/gen-narration.mjs   (needs: npm i --no-save msedge-tts; Node 22.6+ for .ts imports)
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { TOUR } from "../src/data/tourScript.ts";
import { FILM_MINUTES_RANGE, filmLightLine, filmLines } from "../src/data/filmScript.ts";
import { textKey } from "../src/utils/textKey.ts";

const VOICE = "en-GB-SoniaNeural";
const OUT = path.resolve("public/narration");
fs.mkdirSync(OUT, { recursive: true });

const lines = new Set();
for (const l of filmLines(8)) lines.add(l);
for (let m = FILM_MINUTES_RANGE[0]; m <= FILM_MINUTES_RANGE[1]; m++) lines.add(filmLightLine(m));
for (const s of TOUR) {
  lines.add(s.simple);
  lines.add(s.expert);
}

async function synth(text) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: "-4%" });
  const chunks = [];
  await new Promise((res, rej) => {
    audioStream.on("data", (c) => chunks.push(c));
    audioStream.on("end", res);
    audioStream.on("close", res);
    audioStream.on("error", rej);
  });
  return Buffer.concat(chunks);
}

const manifest = {};
let made = 0;
let reused = 0;
for (const text of lines) {
  const key = textKey(text);
  const file = `${key}.mp3`;
  manifest[key] = file;
  const full = path.join(OUT, file);
  if (fs.existsSync(full) && fs.statSync(full).size > 2000) {
    reused++;
    continue;
  }
  let ok = false;
  for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
    try {
      const audio = await synth(text);
      if (audio.length < 2000) throw new Error("audio too short");
      fs.writeFileSync(full, audio);
      ok = true;
      made++;
      process.stdout.write(".");
    } catch {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  if (!ok) console.log(`\nFAILED after retries: ${text.slice(0, 60)}`);
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ voice: VOICE, files: manifest }, null, 0));
const total = Object.keys(manifest).length;
const bytes = Object.values(manifest).reduce((s, f) => s + (fs.existsSync(path.join(OUT, f)) ? fs.statSync(path.join(OUT, f)).size : 0), 0);
console.log(`\n${total} lines (${made} new, ${reused} reused), ${(bytes / 1024 / 1024).toFixed(2)} MB`);
