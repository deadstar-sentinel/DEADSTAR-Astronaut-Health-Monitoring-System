/**
 * What LIFELINE says out loud after a console command. Every reply comes from a fixed,
 * finite set, so each one is pre-recorded in the narrator's voice (Sonia, en-GB) by
 * scripts/gen-narration.mjs. No live text ever falls back to a robotic browser voice.
 * Pure data + functions: also imported by the Node generation script.
 */
import { ANATOMY_CATALOG } from "./anatomyCatalog.ts";
import { EMERGENCY_SCENARIOS } from "./emergencyScenarios.ts";

/** Visualization modes the console accepts, with how to say them. */
export const SPOKEN_MODES: Record<string, string> = {
  holographic: "holographic",
  xray: "X-ray",
  mri: "MRI scan",
  organ: "organ",
  muscular: "muscular",
  nervous: "nervous system",
  thermal: "thermal",
  realistic: "realistic anatomy",
};

/** Make a name speakable: subscripts, abbreviations, casing. */
function say(name: string): string {
  return name
    .replace(/CO₂|CO2/g, "C O 2")
    .replace(/O₂/g, "oxygen")
    .replace(/SpO2/gi, "oxygen saturation")
    .replace(/\(.*?\)/g, "")
    .replace(/&/g, "and")
    .replace(/[<>"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

export const VOICE = {
  help: "Here's what I can do. Ask me to show any organ, simulate an emergency, or change the view. The full list is on screen.",
  status: "Here's the current status, on screen now.",
  demo: "Starting the guided tour. Tap the scene any time to pause.",
  scan: (organName: string) => `Focusing on the ${lowerFirst(say(organName))}.`,
  isolate: (organName: string) => `Isolating the ${lowerFirst(say(organName))}. Say reset to bring everything back.`,
  simulate: (scenarioName: string) => `Simulating ${lowerFirst(say(scenarioName))}. Watch the affected anatomy change colour.`,
  severity: (n: number) => `Severity set to level ${n}.`,
  up: "Escalating one stage.",
  down: "De-escalating one stage.",
  noEmergency: "No emergency is running yet. Try asking me to simulate hypoxia.",
  resetEmergency: "Resetting. The anatomy is recovering to normal.",
  resetView: "Back to the full body.",
  pause: "Simulation paused.",
  resume: "Simulation resumed.",
  viewNormal: "Showing healthy anatomy.",
  viewEmergency: "Showing the emergency anatomy.",
  viewCompare: "Comparing healthy and emergency anatomy, side by side.",
  suitOn: "Spacesuit on. I can still see right through it.",
  suitOff: "Back to normal human anatomy.",
  mode: (modeId: string) => `Switching to ${SPOKEN_MODES[modeId] ?? modeId} mode.`,
  emergencyOn: "Emergency simulation mode is open. Pick a scenario, or just ask me.",
  emergencyOff: "Emergency simulation mode closed.",
  unknown: "Sorry, I didn't catch that. Try saying: show me a blood clot.",
};

/** Every line the console can speak, for pre-recording. */
export function allVoiceReplies(): string[] {
  const out = new Set<string>();
  for (const v of Object.values(VOICE)) if (typeof v === "string") out.add(v);
  for (const o of ANATOMY_CATALOG) {
    out.add(VOICE.scan(o.name));
    out.add(VOICE.isolate(o.name));
  }
  for (const s of EMERGENCY_SCENARIOS) out.add(VOICE.simulate(s.name));
  for (let n = 0; n <= 4; n++) out.add(VOICE.severity(n));
  for (const m of Object.keys(SPOKEN_MODES)) out.add(VOICE.mode(m));
  return [...out];
}
