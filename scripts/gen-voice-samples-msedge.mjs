// Audition samples with Microsoft neural voices via the free Edge "Read aloud" service (no key).
// Usage: node scripts/gen-voice-samples-msedge.mjs   (needs: npm i --no-save msedge-tts)
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const OUT = path.resolve("public/narration/samples");
fs.mkdirSync(OUT, { recursive: true });

const LINE =
  "Somewhere between Earth and Mars, four people are farther from home than anyone has ever been. When something goes wrong, there is no hospital, and no time to wait. I'm Lifeline. I'm the flight surgeon who stays with them.";

const VOICES = [
  ["en-US-AvaMultilingualNeural", "ms-warm-ava"],
  ["en-US-EmmaMultilingualNeural", "ms-warm-emma"],
  ["en-GB-SoniaNeural", "ms-warm-sonia-british"],
  ["en-US-AndrewMultilingualNeural", "ms-deep-andrew"],
  ["en-US-BrianMultilingualNeural", "ms-deep-brian"],
  ["en-GB-RyanNeural", "ms-deep-ryan-british"],
];

for (const [voice, label] of VOICES) {
  const t0 = Date.now();
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(LINE, { rate: "-6%", pitch: "+0Hz" });
    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on("data", (c) => chunks.push(c));
      audioStream.on("end", resolve);
      audioStream.on("close", resolve);
      audioStream.on("error", reject);
    });
    const file = path.join(OUT, `${label}.mp3`);
    fs.writeFileSync(file, Buffer.concat(chunks));
    tts.close?.();
    console.log(`${label.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`${label.padEnd(24)} FAILED: ${e instanceof Error ? e.message : e}`);
  }
}
