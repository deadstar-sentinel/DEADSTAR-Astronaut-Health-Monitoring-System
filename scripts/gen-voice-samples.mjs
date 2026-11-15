// Generate audition samples with Kokoro (open-source, Apache-2.0, no key, runs locally).
// Usage: node scripts/gen-voice-samples.mjs   (needs: npm i --no-save kokoro-js)
import fs from "node:fs";
import path from "node:path";
import { KokoroTTS } from "kokoro-js";

const OUT = path.resolve("public/narration/samples");
fs.mkdirSync(OUT, { recursive: true });

const LINE =
  "Somewhere between Earth and Mars, four people are farther from home than anyone has ever been. When something goes wrong, there is no hospital, and no time to wait. I'm Lifeline. I'm the flight surgeon who stays with them.";

const VOICES = [
  ["af_heart", "warm-heart"],
  ["af_bella", "warm-bella"],
  ["bf_emma", "warm-emma-british"],
  ["am_michael", "deep-michael"],
  ["am_onyx", "deep-onyx"],
  ["bm_george", "deep-george-british"],
];

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
for (const [voice, label] of VOICES) {
  const t0 = Date.now();
  const audio = await tts.generate(LINE, { voice, speed: 0.95 });
  const file = path.join(OUT, `${label}.wav`);
  await audio.save(file);
  console.log(`${label.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
