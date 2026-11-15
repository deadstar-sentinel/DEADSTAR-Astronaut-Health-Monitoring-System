/**
 * LIFELINE command console grammar. Accepts terse commands (SCAN HEART, SIMULATE HYPOXIA
 * --severity=3) and plain-English requests ("show me a blood clot"). Pure and testable:
 * it returns an action; App executes it.
 */
import type { AnatomyId, VisualizationMode } from "../data/anatomyCatalog.ts";
import { EMERGENCY_SCENARIOS } from "../data/emergencyScenarios.ts";
import type { EmergencyView } from "./emergencyState.ts";

export type ConsoleAction =
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "clear" }
  | { kind: "demo" }
  | { kind: "scan"; organ: AnatomyId }
  | { kind: "isolate"; organ: AnatomyId }
  | { kind: "simulate"; scenarioId: string; severity: number | null }
  | { kind: "severity"; level: number }
  | { kind: "step"; delta: number }
  | { kind: "reset" }
  | { kind: "pause"; paused: boolean }
  | { kind: "view"; view: EmergencyView }
  | { kind: "suit"; on: boolean }
  | { kind: "mode"; mode: VisualizationMode }
  | { kind: "emergency"; on: boolean }
  | { kind: "unknown"; text: string; suggestion: string | null };

export const HELP_LINES: [string, string][] = [
  ["SCAN <organ>", "focus the camera on an organ (heart, brain, lungs, kidneys …)"],
  ["ISOLATE <organ>", "show only that organ"],
  ["SIMULATE <scenario> [--severity=0-4]", "run an emergency (hypoxia, clot, sans, bone loss …)"],
  ["SEVERITY <0-4> · UP · DOWN", "set or step the emergency stage"],
  ["PAUSE · RESUME · RESET", "control the running simulation"],
  ["VIEW normal|emergency|compare", "toggle healthy vs emergency anatomy"],
  ["SUIT on|off", "astronaut spacesuit (X-ray overlay in emergencies)"],
  ["MODE <holographic|xray|mri|organ|muscular|nervous|thermal|realistic>", "visualization mode"],
  ["STATUS · DEMO · CLEAR · HELP", "summary, guided tour, clear log, this list"],
  ["or just ask", "\"show me a blood clot\", \"what happens to bones in space\""],
];

const ORGAN_ALIASES: [RegExp, AnatomyId][] = [
  [/\bbrain|head|neuro|cereb/, "brain"],
  [/\bheart|cardiac|cardio/, "heart"],
  [/\blungs?\b|pulmon|breath|respirat/, "lungs"],
  [/\bliver|hepat/, "liver"],
  [/\bkidneys?|renal|bladder/, "kidneys"],
  [/\bstomach|gastr/, "stomach"],
  [/\bpancreas/, "pancreas"],
  [/\bsmall intestine|small bowel|duoden/, "small_intestine"],
  [/\blarge intestine|colon|bowel|intestine|gut/, "large_intestine"],
  [/\bspine|vertebra|back bone|backbone/, "spine"],
  [/\bskelet|bones?\b|skull/, "skeletal"],
  [/\bmuscles?|muscular/, "muscular"],
  [/\bnerves?|nervous/, "nervous"],
  [/\bvessels?|veins?|arter|blood|circulat|vascular/, "circulatory"],
];

/** Plain-language cues for scenarios, checked before name-token matching. */
const SCENARIO_ALIASES: [RegExp, string][] = [
  [/clot|thromb|dvt/, "venous_thrombosis"],
  [/retrograde|reverse(d)? flow|backward/, "retrograde_flow"],
  [/stasis|stagnant/, "venous_stasis"],
  [/heart attack|infarct|\bmi\b|coronary/, "myocardial_infarction"],
  [/arrhythm|irregular heart|palpitat/, "arrhythmia"],
  [/faint|orthostat|standing up|dizz/, "orthostatic_intolerance"],
  [/sans|neuro-?ocular|optic|vision|eyes? (change|swell)/, "sans"],
  [/disc edema|papill/, "optic_disc_edema"],
  [/vestibul|motion sick|balance|nause/, "vestibular_dysfunction"],
  [/disorient/, "spatial_disorientation"],
  [/stroke|neurolog/, "neuro_emergency"],
  [/headache/, "fluid_shift_headache"],
  [/cogniti|reaction time|attention|memory/, "cognitive_impairment"],
  [/hypercap|co2|carbon dioxide/, "hypercapnia"],
  [/scrubber/, "co2_scrubber_failure"],
  [/suit (pressure|leak|breach)|decompress/, "suit_pressure_failure"],
  [/ventilat|fan|airflow/, "ventilation_failure"],
  [/oxygen (supply|failure|tank)/, "o2_supply_failure"],
  [/hypox|oxygen|spo2/, "hypoxia"],
  [/atroph|muscle loss|muscles? (shrink|waste)/, "muscle_atrophy"],
  [/strength/, "reduced_strength"],
  [/endurance|fatigue/, "reduced_endurance"],
  [/fractur|broken|break/, "bone_fracture"],
  [/bone (loss|density)|osteo|bmd|bones? in space/, "bone_loss"],
  [/calcium/, "calcium_loss"],
  [/kidney stone|renal stone|stone/, "kidney_stone"],
  [/dehydrat/, "dehydration"],
  [/retention|urinat/, "urinary_retention"],
  [/viral|virus|herpes|reactivat/, "viral_reactivation"],
  [/fever|infection/, "infection_response"],
  [/immun/, "altered_immune"],
  [/appendic|abdomen|abdominal/, "acute_abdomen"],
  [/glucose|insulin|sugar/, "glucose_regulation"],
];

const MODES: VisualizationMode[] = ["holographic", "xray", "mri", "organ", "muscular", "nervous", "thermal", "realistic"];

export function findOrgan(text: string): AnatomyId | null {
  const t = text.toLowerCase();
  for (const [re, id] of ORGAN_ALIASES) if (re.test(t)) return id;
  return null;
}

export function findScenario(text: string): string | null {
  const t = text.toLowerCase().replace(/_/g, " ");
  for (const s of EMERGENCY_SCENARIOS) {
    if (t === s.id.replace(/_/g, " ") || t === s.name.toLowerCase()) return s.id;
  }
  for (const [re, id] of SCENARIO_ALIASES) if (re.test(t)) return id;
  // Fall back to the scenario whose name shares the most words with the request.
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  let best: { id: string; score: number } | null = null;
  for (const s of EMERGENCY_SCENARIOS) {
    const name = s.name.toLowerCase();
    const score = words.filter((w) => name.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

function severityFrom(text: string): number | null {
  const m = text.match(/(?:--severity=|severity\s*|level\s*|\bl)([0-4])\b/i) ?? text.match(/\b([0-4])\s*$/);
  return m ? Number(m[1]) : null;
}

export function parseCommand(raw: string): ConsoleAction {
  const text = raw.trim();
  const t = text.toLowerCase();
  if (!t) return { kind: "unknown", text, suggestion: null };
  const [verb, ...restParts] = t.split(/\s+/);
  const rest = restParts.join(" ");

  switch (verb) {
    case "help":
    case "?":
    case "commands":
      return { kind: "help" };
    case "status":
    case "sitrep":
      return { kind: "status" };
    case "clear":
    case "cls":
      return { kind: "clear" };
    case "demo":
    case "tour":
      return { kind: "demo" };
    case "reset":
    case "stop":
    case "normal":
      if (verb === "normal" && rest) break;
      return { kind: "reset" };
    case "pause":
    case "hold":
      return { kind: "pause", paused: true };
    case "resume":
    case "play":
    case "continue":
      return { kind: "pause", paused: false };
    case "up":
    case "worse":
    case "escalate":
      return { kind: "step", delta: 1 };
    case "down":
    case "better":
    case "deescalate":
      return { kind: "step", delta: -1 };
    case "severity":
    case "level":
    case "stage": {
      const n = Number(rest.replace(/[^0-4]/g, "").slice(0, 1));
      if (rest && Number.isFinite(n)) return { kind: "severity", level: n };
      break;
    }
    case "view":
    case "compare":
      if (verb === "compare" || /compar/.test(rest)) return { kind: "view", view: "compare" };
      if (/normal|healthy/.test(rest)) return { kind: "view", view: "normal" };
      if (/emerg|abnormal/.test(rest)) return { kind: "view", view: "emergency" };
      break;
    case "suit":
    case "astronaut":
      return { kind: "suit", on: !/\boff\b|remove|human/.test(rest) };
    case "human":
      return { kind: "suit", on: false };
    case "emergency":
    case "sos":
      return { kind: "emergency", on: !/\boff\b|close|exit/.test(rest) };
    case "mode": {
      const m = MODES.find((x) => rest.replace(/[^a-z]/g, "").startsWith(x.replace("-", "")) || (x === "xray" && /x-?ray/.test(rest)));
      if (m) return { kind: "mode", mode: m };
      break;
    }
    case "scan":
    case "focus":
    case "show":
    case "inspect": {
      const scenario = /clot|attack|loss|stone|failure|fracture|sickness|infection|hypox|hypercap|sans|arrhythm/.test(rest) ? findScenario(rest) : null;
      if (scenario) return { kind: "simulate", scenarioId: scenario, severity: severityFrom(rest) };
      const organ = findOrgan(rest);
      if (organ) return { kind: "scan", organ };
      break;
    }
    case "isolate": {
      const organ = findOrgan(rest);
      if (organ) return { kind: "isolate", organ };
      break;
    }
    case "simulate":
    case "sim":
    case "run":
    case "trigger": {
      const scenario = findScenario(rest.replace(/--severity=\d|severity\s*\d|level\s*\d/g, "").trim());
      if (scenario) return { kind: "simulate", scenarioId: scenario, severity: severityFrom(rest) };
      break;
    }
    default:
      break;
  }

  // Natural language: a scenario cue wins over an organ name ("blood clot" -> thrombosis, not vessels).
  const scenario = SCENARIO_ALIASES.find(([re]) => re.test(t))?.[1] ?? null;
  if (scenario) return { kind: "simulate", scenarioId: scenario, severity: severityFrom(t) };
  const organ = findOrgan(t);
  if (organ) return { kind: "scan", organ };
  return { kind: "unknown", text, suggestion: findScenario(t) };
}
