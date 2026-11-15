/**
 * Spaceflight Emergency Simulation: scenario registry and local knowledge base.
 *
 * Every scenario is an EDUCATIONAL SIMULATION. Indicator values are generated
 * demonstration data (labelled SIMULATED in the UI), never astronaut telemetry
 * and never a clinical threshold. Evidence classes separate documented
 * spaceflight risks from general emergencies and hypothetical teaching cases.
 */
import type { AnatomyId } from "./anatomyCatalog.ts";
import type { SuitScenarioId } from "../utils/telemetryEngine.ts";

export type EvidenceClass = "documented" | "associated" | "general" | "hypothetical";

export const EVIDENCE_META: Record<EvidenceClass, { label: string; short: string; className: string }> = {
  documented: {
    label: "Documented spaceflight risk",
    short: "DOCUMENTED RISK",
    className: "border-cyan-300/60 text-cyan-200 bg-cyan-500/10",
  },
  associated: {
    label: "Spaceflight-associated physiological change",
    short: "SPACEFLIGHT-ASSOCIATED",
    className: "border-violet-300/60 text-violet-200 bg-violet-500/10",
  },
  general: {
    label: "General medical emergency",
    short: "GENERAL EMERGENCY",
    className: "border-orange-300/60 text-orange-200 bg-orange-500/10",
  },
  hypothetical: {
    label: "Hypothetical educational scenario",
    short: "HYPOTHETICAL",
    className: "border-slate-300/50 text-slate-200 bg-slate-500/10",
  },
};

export type SeverityLevel = 0 | 1 | 2 | 3 | 4;

export const SEVERITY_META: { level: SeverityLevel; label: string; hex: string; text: string }[] = [
  { level: 0, label: "Normal", hex: "#00E5FF", text: "text-cyan-300" },
  { level: 1, label: "Mild", hex: "#FFD45C", text: "text-yellow-300" },
  { level: 2, label: "Moderate", hex: "#FF8C42", text: "text-orange-300" },
  { level: 3, label: "Severe", hex: "#FF3158", text: "text-rose-300" },
  { level: 4, label: "Critical", hex: "#FF3158", text: "text-rose-200" },
];

export type FlowMode =
  | "normal"
  | "reduced"
  | "stasis"
  | "retrograde"
  | "obstructed"
  | "pooling"
  | "cephalad";

/** Fractional point inside a mesh's bounding box (0..1 on each axis, twin-local). */
export interface MeshPoint {
  mesh: string;
  at: [number, number, number];
}

export interface EmergencyFx {
  /** Mesh names (exact or prefix) that change colour with severity. */
  targets: string[];
  /** Organ used for camera focus and isolation. */
  primary: AnatomyId | null;
  /** Where the floating emergency callout is anchored. */
  anchor: MeshPoint;
  /** Flow particles along a vessel/nerve centreline. `from` = where flow enters. */
  flow?: { mesh: string; from: "top" | "bottom"; mode: FlowMode; kind?: "blood" | "neural" };
  /** Draw a thrombus on the flow path. */
  clot?: boolean;
  /** Gas-exchange particles in the lungs. */
  gas?: "o2_low" | "co2_high" | "both";
  /** Bone lattice thinning shader. */
  porosity?: boolean;
  /** Muscle volume reduction (vertex shrink) with an outline of the original. */
  shrink?: boolean;
  /** Dark localized injury zone on a target surface. */
  hotspot?: MeshPoint & { radius: number };
  marker?: MeshPoint & { kind: "fracture" | "injury" | "stone" | "edema" };
  /** Three orientation rings around the head that drift out of alignment. */
  rings?: boolean;
  /** Illustrative optic nerves from both eyes to the optic chiasm. */
  opticNerve?: boolean;
  immune?: "reduced" | "reactivation" | "cluster";
  beat?: "irregular" | "weak";
  urine?: "normal" | "retention" | "reduced";
  /** Structures drawn darker (e.g. reduced perfusion). */
  dim?: string[];
}

export interface Indicator {
  label: string;
  unit: string;
  /** Simulated value at severity levels 0..4. */
  values: [number, number, number, number, number];
  decimals: number;
}

export type EmergencyCategoryId =
  | "cardiovascular"
  | "neuro"
  | "respiratory"
  | "muscular"
  | "skeletal"
  | "eyes"
  | "renal"
  | "immune"
  | "digestive";

export interface EmergencyScenario {
  id: string;
  name: string;
  category: EmergencyCategoryId;
  evidence: EvidenceClass;
  affected: string[];
  /** Q3: why it can occur during spaceflight. */
  relevance: string;
  /** Q1: what is happening inside the body. */
  mechanism: string;
  /** Q4: how microgravity or the mission environment contributes. */
  environment: string;
  /** Q5: physiological consequences. */
  consequences: string;
  /** Q6: what can be monitored. */
  monitoring: string;
  /** Q7: what the 3D simulation shows. */
  visual: string;
  /** Q8: what is established vs simplified or uncertain. */
  evidenceNote: string;
  /** Suggested educational response (not medical advice). */
  response: string;
  /** Stage labels for levels 0..maxLevel. */
  stages: string[];
  indicators: Indicator[];
  fx: EmergencyFx;
  /** Linked spacesuit telemetry scenario when the astronaut suit is worn. */
  suitScenario?: SuitScenarioId;
}

export interface EmergencyCategory {
  id: EmergencyCategoryId;
  label: string;
  short: string;
  description: string;
  focusOrgan: AnatomyId | null;
  scenarioIds: string[];
}

/* ------------------------------------------------------------------ */
/* Mesh name groups from the realistic twin (public/models/twin.glb)   */
/* and the procedural builders in src/three/anatomyBuilder.ts.         */
/* Side suffix "_1" = the body's left (+x), "_-1" = the body's right.  */
/* ------------------------------------------------------------------ */
const HEART = "ORG_heart";
const ARTERIES = "ORG_vessels";
const IJV_L = "PROC_vein_jugular_1";
const IJV_R = "PROC_vein_jugular_-1";
const LEG_VEIN_L = "PROC_vein_leg_1";
const LEG_VEINS = "PROC_vein_leg_";
const BRAIN = "PROC_brain_";
const CEREBRUM = "PROC_brain_cerebrum";
const BRAINSTEM = "PROC_brain_brainstem";
const CEREBELLUM = "PROC_brain_cerebellum";
const CHIASM = "PROC_brain_optic_chiasm";
const EYES = "ORG_eye_";
const EYE_L = "ORG_eye_L";
const EARS = "ORG_ear_";
const SPINAL_CORD = "PROC_nerve_spinal_cord";
const LUNGS = "ORG_lung_";
const AIRWAYS = "ORG_airways";
const CALF = ["PROC_muscle_gastroc_", "PROC_muscle_tibialis_"];
const QUADS = ["PROC_muscle_rectus_fem_", "PROC_muscle_vastus_"];
const HAMS = ["PROC_muscle_ham_"];
const GLUTES = ["PROC_muscle_glute_"];
const BACK = ["PROC_muscle_erector_"];
const POSTURAL = [...CALF, ...QUADS, ...GLUTES, ...BACK];
const ARMS = ["PROC_muscle_biceps_", "PROC_muscle_triceps_", "PROC_muscle_delt_", "PROC_muscle_forearm_"];
const PELVIS = "ORG_pelvis";
const LEG_BONES = "ORG_bones_leg";
const SPINE = "ORG_spine";
const KIDNEYS = "ORG_kidney_";
const KIDNEY_L = "ORG_kidney_L";
const BLADDER = "ORG_bladder";
const LYMPH = "ORG_lymph";
const STOMACH = "ORG_stomach";
const LIVER = "ORG_liver";
const PANCREAS = "PROC_pancreas_";
const LARGE_INTESTINE = "PROC_large_intestine_";
const SMALL_INTESTINE = "PROC_small_intestine_";

const C = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
const MID = C(0.5, 0.5, 0.5);

export const EMERGENCY_SCENARIOS: EmergencyScenario[] = [
  /* ============================ CARDIOVASCULAR ============================ */
  {
    id: "venous_thrombosis",
    name: "Spaceflight-Associated Venous Thrombosis",
    category: "cardiovascular",
    evidence: "documented",
    affected: ["Left internal jugular vein", "Venous return to the heart"],
    mechanism:
      "A blood clot (thrombus) forms inside a vein and narrows or blocks the channel, so blood drains more slowly from the head and neck toward the heart.",
    relevance:
      "In a 2019 study of 11 ISS crew members, 6 showed stagnant or reversed blood flow in the left internal jugular vein during flight, and one had an occlusive clot that was treated in orbit with anticoagulant medication.",
    environment:
      "Without gravity, roughly 1.5 to 2 litres of fluid shift toward the head. Neck veins stay distended and flow can slow or stall. Slow flow is a classic contributor to clot formation; vessel-wall and blood-clotting factors are also being studied.",
    consequences:
      "A clot can obstruct venous drainage. The main concern is that part of a clot breaks off and travels to the lungs (pulmonary embolism). Treatment options in orbit are limited, which is why this is tracked as a mission risk.",
    monitoring:
      "Ultrasound of the neck veins (flow direction, velocity, compressibility), symptoms such as neck swelling or headache, and medication supply for anticoagulation.",
    visual:
      "The left internal jugular vein turns from cyan to the severity colour. Particles show blood moving toward the heart; a red clot grows on the vessel and more particles stall behind it as the stages advance.",
    evidenceNote:
      "Established: altered jugular flow and in-flight thrombi have been observed in ISS crew. Simplified: clot size, its position on the vein, and the stage sequence are illustrative, not a prediction of how a real clot develops. Prevalence across all astronauts is not known.",
    response:
      "Educational outline: confirm with ultrasound, consult flight surgeons on the ground, and follow the mission's anticoagulation protocol. In-flight cases have been managed this way.",
    stages: ["Normal flow", "Reduced flow", "Partial obstruction", "Severe obstruction", "Critical occlusion"],
    indicators: [
      { label: "Jugular flow index", unit: "% baseline", values: [100, 72, 44, 18, 4], decimals: 0 },
      { label: "Heart rate", unit: "bpm", values: [64, 66, 72, 84, 102], decimals: 0 },
      { label: "SpO₂", unit: "%", values: [98, 98, 97, 95, 91], decimals: 0 },
    ],
    fx: {
      targets: [IJV_L],
      primary: "circulatory",
      anchor: { mesh: IJV_L, at: C(0.5, 0.55, 0.5) },
      flow: { mesh: IJV_L, from: "top", mode: "obstructed" },
      clot: true,
    },
  },
  {
    id: "altered_venous_flow",
    name: "Altered Venous Blood Flow",
    category: "cardiovascular",
    evidence: "associated",
    affected: ["Internal jugular veins", "Superior vena cava"],
    mechanism:
      "Blood in the neck veins moves at a different speed or pattern than on Earth because the pressures that normally drain the head have changed.",
    relevance:
      "Ultrasound studies on the ISS have recorded slower, stagnant, and in some crew reversed flow in the internal jugular vein.",
    environment:
      "On Earth, gravity helps drain blood from the head when upright. In weightlessness that help disappears and fluid redistributes toward the upper body, changing venous pressures. This is not simply 'thicker blood'; several factors interact.",
    consequences:
      "Most altered flow causes no symptoms, but slower flow is one recognized contributor to thrombosis risk and is studied alongside SANS and fluid-shift headaches.",
    monitoring: "Jugular vein ultrasound (cross-section, flow velocity, flow direction) and fluid-shift measures.",
    visual:
      "Flow particles slow down along both jugular veins. Use Compare to alternate between normal flow and the altered state.",
    evidenceNote:
      "Established: altered jugular hemodynamics in flight. Simplified: particle speed is a relative illustration, not a measured velocity.",
    response:
      "Educational outline: periodic ultrasound surveillance; lower-body negative pressure is being studied as a way to pull fluid back toward the legs.",
    stages: ["Normal flow", "Slower flow", "Markedly slowed", "Near-stagnant"],
    indicators: [
      { label: "Jugular flow index", unit: "% baseline", values: [100, 76, 52, 30, 30], decimals: 0 },
      { label: "Jugular cross-section", unit: "% baseline", values: [100, 135, 170, 210, 210], decimals: 0 },
    ],
    fx: {
      targets: [IJV_L, IJV_R],
      primary: "circulatory",
      anchor: { mesh: IJV_L, at: C(0.5, 0.7, 0.5) },
      flow: { mesh: IJV_L, from: "top", mode: "reduced" },
    },
  },
  {
    id: "venous_stasis",
    name: "Venous Blood Stasis",
    category: "cardiovascular",
    evidence: "associated",
    affected: ["Left internal jugular vein"],
    mechanism: "Blood in a vein segment nearly stops moving and pools instead of returning steadily to the heart.",
    relevance: "Stagnant jugular flow was one of the patterns recorded in ISS crew during long-duration missions.",
    environment:
      "Headward fluid shift distends the neck veins and removes the gravitational pressure gradient that normally keeps upper-body venous blood draining.",
    consequences: "Stasis is one of the three classic contributors to clot formation (with vessel-wall changes and altered clotting).",
    monitoring: "Doppler ultrasound showing absent or very low flow; repeat imaging to detect clot formation early.",
    visual: "Particles in the left jugular vein slow, jitter in place, and accumulate instead of travelling to the heart.",
    evidenceNote:
      "Established: stagnant flow observed in flight. Uncertain: how often stasis leads to thrombosis in astronauts.",
    response: "Educational outline: imaging follow-up and ground consultation on preventive measures.",
    stages: ["Normal flow", "Sluggish flow", "Intermittent stasis", "Near-complete stasis"],
    indicators: [{ label: "Jugular flow index", unit: "% baseline", values: [100, 55, 22, 6, 6], decimals: 0 }],
    fx: {
      targets: [IJV_L],
      primary: "circulatory",
      anchor: { mesh: IJV_L, at: C(0.5, 0.6, 0.5) },
      flow: { mesh: IJV_L, from: "top", mode: "stasis" },
    },
  },
  {
    id: "retrograde_flow",
    name: "Retrograde Venous Blood Flow",
    category: "cardiovascular",
    evidence: "associated",
    affected: ["Left internal jugular vein"],
    mechanism: "Blood in a vein segment flows backward, away from the heart, for part of the time.",
    relevance: "Reversed flow in the internal jugular vein was recorded in some ISS crew members during flight.",
    environment:
      "Changed venous pressures after the headward fluid shift can reverse the normal pressure gradient in the neck veins.",
    consequences: "Reversed flow is linked with stasis and was observed in the same study that found in-flight thrombi.",
    monitoring: "Doppler ultrasound showing flow direction.",
    visual:
      "Particles first slow, then oscillate, then move upward (away from the heart). Compare toggles back to normal downward drainage.",
    evidenceNote: "Established: retrograde flow observed in flight. Simplified: the timing and degree of reversal are illustrative.",
    response: "Educational outline: imaging surveillance and ground consultation.",
    stages: ["Normal drainage", "Slowed flow", "To-and-fro flow", "Predominantly reversed"],
    indicators: [{ label: "Net flow toward heart", unit: "% baseline", values: [100, 60, 10, -35, -35], decimals: 0 }],
    fx: {
      targets: [IJV_L],
      primary: "circulatory",
      anchor: { mesh: IJV_L, at: C(0.5, 0.6, 0.5) },
      flow: { mesh: IJV_L, from: "top", mode: "retrograde" },
    },
  },
  {
    id: "cv_deconditioning",
    name: "Cardiovascular Deconditioning",
    category: "cardiovascular",
    evidence: "associated",
    affected: ["Heart", "Arterial system", "Plasma volume"],
    mechanism:
      "The heart and blood vessels adapt to a lighter workload: plasma volume falls and the cardiovascular system becomes less prepared to work against gravity.",
    relevance:
      "Plasma volume typically drops by around 10 to 15% early in flight, and reduced aerobic capacity is a recognized NASA concern for long missions.",
    environment:
      "Without gravity the heart no longer pumps blood 'uphill' to the head, and fluid redistribution triggers the body to shed fluid.",
    consequences:
      "Lower exercise capacity and reduced tolerance to standing after landing. These are adaptations, not disease, but they matter for EVA and landing tasks.",
    monitoring: "Heart rate and blood pressure during exercise, VO₂max tests, plasma volume estimates.",
    visual: "The heart beats with reduced amplitude and the arterial tree dims as the stages progress.",
    evidenceNote: "Established: plasma volume loss and aerobic deconditioning. Simplified: the beat amplitude is illustrative.",
    response: "Educational outline: daily aerobic and resistance exercise; fluid and salt loading before landing.",
    stages: ["Baseline", "Early adaptation", "Moderate deconditioning", "Marked deconditioning"],
    indicators: [
      { label: "Plasma volume", unit: "% baseline", values: [100, 93, 88, 84, 84], decimals: 0 },
      { label: "Aerobic capacity", unit: "% preflight", values: [100, 95, 89, 82, 82], decimals: 0 },
    ],
    fx: {
      targets: [HEART, ARTERIES],
      primary: "heart",
      anchor: { mesh: HEART, at: MID },
      beat: "weak",
    },
  },
  {
    id: "arrhythmia",
    name: "Cardiac Arrhythmia",
    category: "cardiovascular",
    evidence: "documented",
    affected: ["Heart", "Cardiac conduction system"],
    mechanism: "The heart beats irregularly: extra beats, pauses, or runs of fast rhythm interrupt the normal steady rhythm.",
    relevance:
      "Rhythm disturbances have been recorded in some astronauts, and NASA has tracked cardiac rhythm problems as a spaceflight risk. Most recorded events were benign.",
    environment:
      "Proposed contributors include fluid and electrolyte shifts, stress, sleep loss, and cardiac remodelling. The evidence is limited.",
    consequences: "Most extra beats are harmless; sustained arrhythmias could reduce cardiac output and need treatment.",
    monitoring: "ECG (Holter recordings), heart rate variability, electrolytes.",
    visual: "The heart beats with irregular timing and amplitude, colour-coded by severity.",
    evidenceNote:
      "Established: arrhythmias recorded in some crew. Uncertain: whether spaceflight increases the rate above preflight levels. Not every astronaut is affected.",
    response: "Educational outline: record an ECG, check electrolytes, and consult ground flight surgeons.",
    stages: ["Sinus rhythm", "Occasional extra beats", "Frequent extra beats", "Sustained irregular rhythm", "Unstable rhythm"],
    indicators: [
      { label: "Heart rate", unit: "bpm", values: [64, 68, 78, 112, 148], decimals: 0 },
      { label: "Beat-to-beat irregularity", unit: "index", values: [1, 3, 6, 9, 10], decimals: 0 },
    ],
    fx: {
      targets: [HEART],
      primary: "heart",
      anchor: { mesh: HEART, at: MID },
      beat: "irregular",
    },
  },
  {
    id: "myocardial_infarction",
    name: "Acute Myocardial Infarction",
    category: "cardiovascular",
    evidence: "general",
    affected: ["Heart muscle", "Coronary artery"],
    mechanism:
      "A coronary artery becomes blocked, usually by a clot on a cholesterol plaque, and the heart muscle it supplies is starved of oxygen and begins to die.",
    relevance:
      "This is a general medical emergency that could occur on any long mission. It is not a known direct consequence of microgravity; crew screening is designed to make it unlikely.",
    environment:
      "Spaceflight is not an established cause. The concern for exploration missions is that treatment (catheter lab, surgery) is unavailable and evacuation may take days or months.",
    consequences: "Loss of pumping function, dangerous rhythms, and shock if a large area is affected.",
    monitoring: "ECG changes, cardiac biomarkers where available, chest pain, blood pressure, rhythm monitoring.",
    visual:
      "A dark crimson injury zone spreads on the front wall of the heart while beats weaken. The location is illustrative.",
    evidenceNote:
      "General medicine, not a spaceflight-specific finding. The injury zone is a simplified representation of an anterior-wall infarct.",
    response:
      "Educational outline: follow the onboard cardiac emergency protocol and contact the ground immediately.",
    stages: ["Normal perfusion", "Reduced coronary flow", "Ischaemia", "Infarction", "Extensive infarction"],
    indicators: [
      { label: "Heart rate", unit: "bpm", values: [66, 78, 92, 108, 124], decimals: 0 },
      { label: "Systolic pressure", unit: "mmHg", values: [118, 124, 112, 96, 82], decimals: 0 },
      { label: "Pump function", unit: "% baseline", values: [100, 92, 80, 62, 45], decimals: 0 },
    ],
    fx: {
      targets: [HEART],
      primary: "heart",
      anchor: { mesh: HEART, at: C(0.4, 0.45, 0.85) },
      hotspot: { mesh: HEART, at: C(0.4, 0.42, 0.95), radius: 0.035 },
      beat: "weak",
    },
  },
  {
    id: "orthostatic_intolerance",
    name: "Orthostatic Intolerance",
    category: "cardiovascular",
    evidence: "documented",
    affected: ["Leg veins", "Heart", "Brain perfusion"],
    mechanism:
      "When the astronaut stands up after flight, blood pools in the legs, less returns to the heart, and blood pressure to the brain drops, causing dizziness or fainting.",
    relevance:
      "Light-headedness or inability to stand for several minutes is commonly observed after landing, more so after long-duration missions.",
    environment:
      "In flight the body adapts to weightlessness: plasma volume falls and the reflexes that tighten blood vessels on standing are less practised. Gravity on return exposes these adaptations.",
    consequences: "Dizziness, fainting, and reduced ability to perform tasks right after landing, such as egress.",
    monitoring: "Heart rate and blood pressure during stand tests or tilt tests after landing.",
    visual:
      "Particles in the leg veins slow and settle downward, the heart is highlighted, and the brain dims to show reduced perfusion.",
    evidenceNote: "Established: post-flight orthostatic intolerance. Simplified: the pooling and dimming are illustrative.",
    response: "Educational outline: fluid loading before re-entry, compression garments, and assisted egress.",
    stages: ["Seated, stable", "Standing: mild drop", "Pre-syncope", "Near-faint", "Syncope"],
    indicators: [
      { label: "Heart rate", unit: "bpm", values: [66, 86, 104, 122, 128], decimals: 0 },
      { label: "Systolic pressure", unit: "mmHg", values: [118, 108, 96, 84, 72], decimals: 0 },
      { label: "Brain perfusion", unit: "% baseline", values: [100, 92, 82, 70, 58], decimals: 0 },
    ],
    fx: {
      targets: [LEG_VEINS, HEART],
      primary: "circulatory",
      anchor: { mesh: LEG_VEIN_L, at: C(0.5, 0.35, 0.5) },
      flow: { mesh: LEG_VEIN_L, from: "bottom", mode: "pooling" },
      dim: [BRAIN],
    },
  },

  /* ============================ BRAIN & NERVOUS =========================== */
  {
    id: "sans",
    name: "Spaceflight-Associated Neuro-ocular Syndrome (SANS)",
    category: "neuro",
    evidence: "documented",
    affected: ["Eyes (posterior globe)", "Optic nerve head", "Optic nerves", "Brain"],
    mechanism:
      "Changes develop at the back of the eye: swelling of the optic disc, flattening of the eyeball, and folds in the layers under the retina. Vision can shift toward far-sightedness.",
    relevance:
      "SANS is one of NASA's top-priority risks for long missions; findings appear in a significant proportion of long-duration crew.",
    environment:
      "The leading hypotheses involve the headward fluid shift and altered pressure around the eye and optic nerve. Individual factors (genetics, B-vitamin metabolism) and CO₂ are also being studied. The exact cause is not settled.",
    consequences: "Mostly mild vision changes; some findings persist after return. Long-term effects for Mars-length missions are unknown.",
    monitoring: "Optical coherence tomography (OCT), fundoscopy, ocular ultrasound, visual acuity tests.",
    visual:
      "The eyes and illustrative optic nerves turn the severity colour; a swelling marker grows at the back of the left eye.",
    evidenceNote:
      "Established: optic disc edema, globe flattening, choroidal folds, refractive shifts. Uncertain: cause and long-term outcome. The nerve paths are drawn schematically.",
    response: "Educational outline: scheduled eye imaging, corrective lenses, and research countermeasures such as lower-body negative pressure.",
    stages: ["Normal eye", "Subtle changes", "Optic disc edema", "Edema with globe flattening"],
    indicators: [
      { label: "Optic nerve sheath diameter", unit: "% baseline", values: [100, 104, 109, 115, 115], decimals: 0 },
      { label: "Refractive shift", unit: "diopters", values: [0, 0.25, 0.5, 1.0, 1.0], decimals: 2 },
    ],
    fx: {
      targets: [EYES, CHIASM],
      primary: "brain",
      anchor: { mesh: EYE_L, at: MID },
      opticNerve: true,
      marker: { mesh: EYE_L, at: C(0.5, 0.5, 0.1), kind: "edema" },
    },
  },
  {
    id: "vestibular_dysfunction",
    name: "Vestibular Dysfunction",
    category: "neuro",
    evidence: "documented",
    affected: ["Inner ear (vestibular organs)", "Brainstem", "Cerebellum"],
    mechanism:
      "The balance organs in the inner ear send signals that no longer match what the eyes see, and the brain must re-learn how to interpret them.",
    relevance:
      "Space motion sickness is common in the first days of flight, and balance problems are common after landing. NASA tracks this as the sensorimotor risk.",
    environment:
      "The otolith organs sense gravity. In weightlessness they no longer signal 'down', which creates a sensory conflict until the brain adapts.",
    consequences: "Nausea, disorientation, and impaired coordination; after landing, unsteady walking and difficulty with tasks.",
    monitoring: "Symptom scores, balance and gait tests, eye-movement tests.",
    visual: "The inner ears, brainstem, and cerebellum are highlighted; orientation rings around the head drift out of alignment.",
    evidenceNote: "Established: space motion sickness and post-flight balance impairment. The rings are a teaching metaphor, not anatomy.",
    response: "Educational outline: anti-nausea medication, limiting head movements early, and gradual readaptation after landing.",
    stages: ["Adapted", "Mild conflict", "Motion sickness", "Severe disorientation"],
    indicators: [
      { label: "Balance score", unit: "% preflight", values: [100, 88, 70, 52, 52], decimals: 0 },
      { label: "Symptom score", unit: "0–20", values: [0, 4, 9, 15, 15], decimals: 0 },
    ],
    fx: {
      targets: [EARS, BRAINSTEM, CEREBELLUM],
      primary: "brain",
      anchor: { mesh: "ORG_ear_L", at: MID },
      rings: true,
    },
  },
  {
    id: "spatial_disorientation",
    name: "Spatial Disorientation",
    category: "neuro",
    evidence: "documented",
    affected: ["Vestibular system", "Visual-vestibular integration in the brain"],
    mechanism: "The astronaut misjudges their own orientation or motion, for example feeling tilted or upside-down.",
    relevance: "Orientation illusions are reported in flight and during landing; they are part of NASA's sensorimotor risk.",
    environment: "Without a gravity reference the brain relies on vision and touch, and conflicting cues produce illusions.",
    consequences: "Errors during piloting, docking, landing, or EVA navigation.",
    monitoring: "Task performance, illusion reports, post-flight sensorimotor tests.",
    visual: "Orientation rings around the head tilt and spin out of alignment; the cerebellum and brainstem are highlighted.",
    evidenceNote: "Established: in-flight and landing illusions. The rings are a metaphor for the brain's internal orientation model.",
    response: "Educational outline: rely on instruments, use visual anchors, and train with disorientation scenarios.",
    stages: ["Oriented", "Mild illusion", "Strong illusion", "Disoriented"],
    indicators: [{ label: "Orientation error", unit: "degrees", values: [0, 8, 25, 60, 60], decimals: 0 }],
    fx: {
      targets: [EARS, CEREBELLUM, BRAINSTEM],
      primary: "brain",
      anchor: { mesh: CEREBELLUM, at: MID },
      rings: true,
    },
  },
  {
    id: "cognitive_impairment",
    name: "Cognitive Performance Impairment",
    category: "neuro",
    evidence: "associated",
    affected: ["Cerebral cortex", "Neural pathways"],
    mechanism: "Attention, reaction time, or memory perform below the astronaut's own baseline.",
    relevance: "NASA tracks cognitive and behavioural risks for long missions; measured changes in flight are usually small.",
    environment:
      "Contributors are multifactorial: sleep loss, workload, isolation, elevated cabin CO₂, and possibly radiation. Microgravity alone is not an established cause.",
    consequences: "Slower responses and more errors during demanding tasks.",
    monitoring: "Psychomotor vigilance test (reaction time), cognitive test batteries, sleep tracking.",
    visual: "The cerebral hemispheres change colour and neural signal pulses along the spinal cord slow down.",
    evidenceNote:
      "Established: sleep loss and high CO₂ impair cognition. Uncertain: the size of spaceflight-specific effects. Signal pulses are illustrative.",
    response: "Educational outline: protect sleep, adjust workload, check cabin CO₂.",
    stages: ["Baseline", "Mild slowing", "Noticeable slowing", "Marked impairment"],
    indicators: [
      { label: "Reaction time", unit: "ms", values: [250, 280, 320, 380, 380], decimals: 0 },
      { label: "Lapses per test", unit: "count", values: [0, 1, 3, 6, 6], decimals: 0 },
    ],
    fx: {
      targets: [CEREBRUM],
      primary: "brain",
      anchor: { mesh: CEREBRUM, at: C(0.5, 0.8, 0.5) },
      flow: { mesh: SPINAL_CORD, from: "top", mode: "reduced", kind: "neural" },
    },
  },
  {
    id: "fluid_shift_headache",
    name: "Fluid-Shift-Associated Headache",
    category: "neuro",
    evidence: "associated",
    affected: ["Head and neck veins", "Brain"],
    mechanism: "Fluid accumulates in the head, producing facial puffiness, nasal congestion, and headache.",
    relevance: "Headache is one of the most frequently reported symptoms in early spaceflight.",
    environment:
      "Fluid moves headward in weightlessness. Headaches in flight are also associated with higher cabin CO₂ and space motion sickness.",
    consequences: "Discomfort and reduced performance; usually improves as the body adapts.",
    monitoring: "Symptom diaries, cabin CO₂ levels, medication use.",
    visual: "Particles in the jugular veins move headward-heavy (cephalad shift) and the brain glows with the severity colour.",
    evidenceNote: "Established: frequent headaches early in flight. Uncertain: the relative roles of fluid shift and CO₂.",
    response: "Educational outline: analgesics, check cabin CO₂, adjust sleep position and workload.",
    stages: ["No symptoms", "Mild headache", "Moderate headache", "Severe headache"],
    indicators: [{ label: "Symptom score", unit: "0–10", values: [0, 3, 5, 8, 8], decimals: 0 }],
    fx: {
      targets: [CEREBRUM, IJV_L, IJV_R],
      primary: "brain",
      anchor: { mesh: CEREBRUM, at: C(0.5, 0.85, 0.6) },
      flow: { mesh: IJV_L, from: "top", mode: "reduced" },
    },
  },
  {
    id: "neuro_emergency",
    name: "Simulated Neurological Emergency",
    category: "neuro",
    evidence: "hypothetical",
    affected: ["Brain region (illustrative)", "Motor pathways"],
    mechanism:
      "An acute disruption of blood supply or function in part of the brain causes sudden neurological symptoms such as weakness or speech difficulty.",
    relevance:
      "This is a hypothetical teaching scenario. Acute neurological emergencies are not known to be caused by spaceflight, but crews must be prepared for rare events far from hospitals.",
    environment: "No established spaceflight mechanism. The scenario explores how an emergency would be recognized and supported onboard.",
    consequences: "Sudden deficits whose severity depends on the region involved.",
    monitoring: "Neurological checks (face, arm, speech), level of consciousness, blood pressure, SpO₂.",
    visual: "A dark injury zone appears in one cerebral hemisphere while signal pulses down the spinal cord weaken.",
    evidenceNote: "Entirely hypothetical and simplified. The location is arbitrary and illustrative.",
    response: "Educational outline: rapid neurological assessment, oxygen if needed, and urgent ground consultation.",
    stages: ["Normal", "Subtle symptoms", "Focal deficit", "Severe deficit", "Critical"],
    indicators: [
      { label: "Neuro check score", unit: "0–15", values: [15, 14, 12, 9, 6], decimals: 0 },
      { label: "Systolic pressure", unit: "mmHg", values: [118, 132, 148, 162, 170], decimals: 0 },
    ],
    fx: {
      targets: [CEREBRUM],
      primary: "brain",
      anchor: { mesh: "PROC_brain_cerebrum_L", at: C(0.6, 0.7, 0.6) },
      hotspot: { mesh: "PROC_brain_cerebrum_L", at: C(0.7, 0.7, 0.6), radius: 0.03 },
      flow: { mesh: SPINAL_CORD, from: "top", mode: "reduced", kind: "neural" },
    },
  },

  /* ============================== RESPIRATORY ============================= */
  {
    id: "hypoxia",
    name: "Hypoxia",
    category: "respiratory",
    evidence: "documented",
    affected: ["Lungs (gas exchange)", "Brain (most oxygen-sensitive organ)"],
    mechanism:
      "Not enough oxygen reaches the tissues. Less oxygen crosses from the lungs into the blood, and the brain is affected first.",
    relevance:
      "NASA tracks hypoxia as a risk, especially for exploration atmospheres with reduced pressure, suit operations, and life-support malfunctions.",
    environment:
      "The risk comes from the engineered environment (cabin or suit pressure and oxygen supply), not from microgravity itself.",
    consequences: "Impaired judgement and coordination, then confusion and loss of consciousness if severe. Early symptoms can go unnoticed.",
    monitoring: "SpO₂, cabin and suit oxygen partial pressure, breathing rate, cognitive checks.",
    visual:
      "Fewer oxygen particles (cyan) travel into the lungs as stages advance; the lungs and brain shift through yellow, orange and red.",
    evidenceNote: "Established physiology. Simulated SpO₂ values illustrate the trend and are not clinical thresholds.",
    response: "Educational outline: restore oxygen supply, use emergency oxygen, and find the source of the failure.",
    stages: ["Normal oxygenation", "Mild hypoxia", "Moderate hypoxia", "Severe hypoxia", "Critical hypoxia"],
    indicators: [
      { label: "SpO₂", unit: "%", values: [98, 94, 89, 83, 76], decimals: 0 },
      { label: "Breathing rate", unit: "br/min", values: [14, 17, 21, 26, 30], decimals: 0 },
      { label: "Heart rate", unit: "bpm", values: [66, 78, 92, 108, 122], decimals: 0 },
    ],
    fx: {
      targets: [LUNGS, AIRWAYS, CEREBRUM],
      primary: "lungs",
      anchor: { mesh: "ORG_lung_L", at: C(0.5, 0.6, 0.5) },
      gas: "o2_low",
    },
    suitScenario: "o2_leak",
  },
  {
    id: "hypercapnia",
    name: "Hypercapnia",
    category: "respiratory",
    evidence: "documented",
    affected: ["Lungs and airways", "Blood CO₂", "Brain"],
    mechanism: "Carbon dioxide builds up in the blood because exhaled CO₂ is not removed fast enough from the breathing air.",
    relevance:
      "Cabin CO₂ on the ISS is higher than on Earth and has been associated with headaches and crew symptoms. Suits also depend on CO₂ removal.",
    environment:
      "In microgravity there is no convection (warm air does not rise), so exhaled CO₂ can collect around the face without ventilation fans.",
    consequences: "Headache, faster breathing, reduced concentration; at high levels, confusion and loss of consciousness.",
    monitoring: "Cabin and suit CO₂ sensors, breathing rate, symptom reports.",
    visual: "Amber CO₂ particles accumulate around the lungs instead of being cleared through the airway.",
    evidenceNote: "Established: CO₂-associated symptoms on the ISS. Simulated values illustrate trends only.",
    response: "Educational outline: increase ventilation, check scrubbers, move to a better-ventilated area.",
    stages: ["Normal clearance", "Mild build-up", "Moderate hypercapnia", "Severe hypercapnia", "Critical"],
    indicators: [
      { label: "Inspired CO₂", unit: "mmHg", values: [2.5, 5, 8, 12, 18], decimals: 1 },
      { label: "Breathing rate", unit: "br/min", values: [14, 17, 21, 26, 30], decimals: 0 },
    ],
    fx: {
      targets: [LUNGS, AIRWAYS],
      primary: "lungs",
      anchor: { mesh: AIRWAYS, at: C(0.5, 0.7, 0.5) },
      gas: "co2_high",
    },
    suitScenario: "co2_saturation",
  },
  {
    id: "o2_supply_failure",
    name: "Oxygen Supply Failure",
    category: "respiratory",
    evidence: "hypothetical",
    affected: ["Lungs", "Brain", "Life-support oxygen system"],
    mechanism: "A malfunction lowers the oxygen delivered to the cabin or suit, which leads to hypoxia in the crew.",
    relevance: "Hypothetical training scenario for a life-support failure. Spacecraft carry redundant and emergency oxygen for this reason.",
    environment: "An engineering failure, not a microgravity effect.",
    consequences: "Progressive hypoxia if not corrected.",
    monitoring: "Oxygen partial pressure, flow and tank pressure, crew SpO₂.",
    visual: "Oxygen particles thin out, the lungs and brain change colour, and in suit mode the existing O₂ leak telemetry scenario is triggered.",
    evidenceNote: "Hypothetical scenario built on established hypoxia physiology.",
    response: "Educational outline: switch to the backup or emergency oxygen supply and isolate the fault.",
    stages: ["Nominal supply", "Degraded supply", "Low supply", "Supply loss", "Critical"],
    indicators: [
      { label: "O₂ supply", unit: "% nominal", values: [100, 78, 55, 30, 10], decimals: 0 },
      { label: "SpO₂", unit: "%", values: [98, 96, 91, 85, 77], decimals: 0 },
    ],
    fx: {
      targets: [LUNGS, AIRWAYS, CEREBRUM],
      primary: "lungs",
      anchor: { mesh: "ORG_lung_R", at: C(0.5, 0.6, 0.5) },
      gas: "o2_low",
    },
    suitScenario: "o2_leak",
  },
  {
    id: "co2_scrubber_failure",
    name: "CO₂ Scrubber Failure",
    category: "respiratory",
    evidence: "hypothetical",
    affected: ["Lungs and airways", "Life-support CO₂ removal"],
    mechanism: "The CO₂ removal system stops working well, so CO₂ builds up in the breathing air and then in the blood.",
    relevance: "Hypothetical training scenario. CO₂ removal is critical life support, as the Apollo 13 crew's improvised filter adapter famously showed.",
    environment: "An engineering failure; poor air mixing in microgravity makes local build-up more likely.",
    consequences: "Hypercapnia: headache, rapid breathing, impaired thinking.",
    monitoring: "CO₂ partial pressure, scrubber status, crew symptoms.",
    visual: "CO₂ particles accumulate around the lungs; in suit mode the existing CO₂ scrubber telemetry scenario is triggered.",
    evidenceNote: "Hypothetical scenario built on established CO₂ physiology.",
    response: "Educational outline: switch to backup removal (spare cartridges), increase ventilation, reduce exertion.",
    stages: ["Nominal removal", "Degraded removal", "Low removal", "Removal failure", "Critical"],
    indicators: [
      { label: "Scrubber efficiency", unit: "%", values: [100, 75, 50, 25, 5], decimals: 0 },
      { label: "Inspired CO₂", unit: "mmHg", values: [2.5, 5, 9, 14, 20], decimals: 1 },
    ],
    fx: {
      targets: [LUNGS, AIRWAYS],
      primary: "lungs",
      anchor: { mesh: AIRWAYS, at: C(0.5, 0.7, 0.5) },
      gas: "co2_high",
    },
    suitScenario: "co2_saturation",
  },
  {
    id: "ventilation_failure",
    name: "Ventilation System Failure",
    category: "respiratory",
    evidence: "hypothetical",
    affected: ["Lungs", "Breathing-zone air quality"],
    mechanism: "Fans stop moving air, so exhaled CO₂ collects around the face and fresh oxygen is not mixed in.",
    relevance: "Hypothetical scenario. Forced ventilation is essential in microgravity because air does not circulate on its own.",
    environment: "Without gravity-driven convection, exhaled air can form a CO₂ pocket around the head.",
    consequences: "Local hypercapnia and reduced oxygen in the breathing zone.",
    monitoring: "Local CO₂ sensors, fan status, symptoms.",
    visual: "CO₂ accumulates and oxygen delivery falls at the same time.",
    evidenceNote: "Hypothetical scenario; the CO₂ pocket effect is established engineering knowledge.",
    response: "Educational outline: move to a ventilated area, use portable fans, repair the system.",
    stages: ["Nominal airflow", "Reduced airflow", "Stagnant air", "No airflow"],
    indicators: [
      { label: "Airflow", unit: "% nominal", values: [100, 60, 25, 0, 0], decimals: 0 },
      { label: "Local CO₂", unit: "mmHg", values: [2.5, 5, 9, 14, 14], decimals: 1 },
    ],
    fx: {
      targets: [LUNGS, AIRWAYS],
      primary: "lungs",
      anchor: { mesh: AIRWAYS, at: C(0.5, 0.7, 0.5) },
      gas: "both",
    },
    suitScenario: "co2_saturation",
  },
  {
    id: "suit_pressure_failure",
    name: "Suit Pressure Failure",
    category: "respiratory",
    evidence: "hypothetical",
    affected: ["Lungs", "Brain", "Joints (decompression risk)"],
    mechanism:
      "Suit pressure drops because of a leak or regulator fault. Oxygen pressure falls (hypoxia) and dissolved nitrogen can form bubbles (decompression sickness).",
    relevance:
      "Hypothetical training scenario. Decompression sickness is a documented NASA risk managed with oxygen pre-breathe before EVAs.",
    environment: "An engineering failure during EVA; vacuum outside the suit makes the consequences rapid.",
    consequences: "Hypoxia, joint pain from decompression sickness, and in extreme cases loss of consciousness.",
    monitoring: "Suit pressure, leak rate, oxygen supply, crew symptoms.",
    visual: "Oxygen particles drop sharply; in suit mode the existing O₂ leak telemetry scenario is triggered and the suit becomes see-through.",
    evidenceNote: "Hypothetical scenario combining established hypoxia and decompression physiology.",
    response: "Educational outline: activate emergency oxygen, terminate the EVA, and return to the airlock.",
    stages: ["Nominal pressure", "Slow leak", "Pressure falling", "Rapid loss", "Critical"],
    indicators: [
      { label: "Suit pressure", unit: "% nominal", values: [100, 92, 78, 55, 30], decimals: 0 },
      { label: "SpO₂", unit: "%", values: [98, 97, 92, 84, 74], decimals: 0 },
    ],
    fx: {
      targets: [LUNGS, AIRWAYS, CEREBRUM],
      primary: "lungs",
      anchor: { mesh: "ORG_lung_L", at: C(0.5, 0.7, 0.5) },
      gas: "o2_low",
    },
    suitScenario: "o2_leak",
  },

  /* ================================ MUSCULAR =============================== */
  {
    id: "muscle_atrophy",
    name: "Microgravity-Associated Muscle Atrophy",
    category: "muscular",
    evidence: "documented",
    affected: ["Calf muscles", "Quadriceps", "Gluteal muscles", "Back extensors"],
    mechanism: "Muscles that normally fight gravity lose protein and shrink because they are no longer loaded.",
    relevance:
      "Older studies without modern exercise equipment reported leg muscle volume losses of roughly 10 to 20% over long missions. Current resistance exercise greatly reduces this.",
    environment: "Postural and weight-bearing muscles lose their constant gravitational load, which shifts the balance toward protein breakdown.",
    consequences: "Weakness and reduced endurance, especially on return to gravity or on a planetary surface.",
    monitoring: "Muscle volume imaging (MRI or ultrasound), strength tests, body composition.",
    visual:
      "Postural muscles shrink in cross-section while a faint cyan outline keeps the original shape for a before-and-after comparison.",
    evidenceNote:
      "Established: muscle loss in weightlessness. Simplified: the shrink amount is exaggerated for visibility; real losses depend on countermeasures.",
    response: "Educational outline: daily resistance and aerobic exercise, adequate protein and energy intake.",
    stages: ["Baseline", "Early loss", "Moderate loss", "Marked loss"],
    indicators: [
      { label: "Calf muscle volume", unit: "% preflight", values: [100, 95, 89, 82, 82], decimals: 0 },
      { label: "Leg strength", unit: "% preflight", values: [100, 93, 85, 76, 76], decimals: 0 },
    ],
    fx: {
      targets: POSTURAL,
      primary: "muscular",
      anchor: { mesh: "PROC_muscle_gastroc_med_1", at: MID },
      shrink: true,
    },
  },
  {
    id: "reduced_strength",
    name: "Reduced Muscle Strength",
    category: "muscular",
    evidence: "associated",
    affected: ["Quadriceps", "Hamstrings", "Calf muscles"],
    mechanism: "Muscles produce less force, partly from lost mass and partly from changes in how nerves activate them.",
    relevance: "Strength losses in the legs and back are well documented after long-duration flight.",
    environment: "Unloading reduces muscle size and neuromuscular drive.",
    consequences: "Harder physical tasks after landing and on planetary surfaces.",
    monitoring: "Isokinetic strength tests, functional task tests.",
    visual: "Thigh and calf muscles change colour and shrink slightly; the outline shows the preflight size.",
    evidenceNote: "Established finding. Shrink is exaggerated for visibility.",
    response: "Educational outline: progressive resistance training in flight.",
    stages: ["Baseline", "Mild loss", "Moderate loss", "Marked loss"],
    indicators: [{ label: "Knee extension strength", unit: "% preflight", values: [100, 92, 84, 75, 75], decimals: 0 }],
    fx: {
      targets: [...QUADS, ...HAMS, ...CALF],
      primary: "muscular",
      anchor: { mesh: "PROC_muscle_rectus_fem_1", at: MID },
      shrink: true,
    },
  },
  {
    id: "reduced_endurance",
    name: "Reduced Muscle Endurance",
    category: "muscular",
    evidence: "associated",
    affected: ["Leg muscles", "Muscle capillaries and mitochondria"],
    mechanism: "Muscles tire faster because their oxidative capacity and blood supply adapt to lower demand.",
    relevance: "Reduced aerobic and muscular endurance is part of NASA's fitness risk for EVA and surface work.",
    environment: "Lower daily workload in weightlessness reduces endurance adaptations.",
    consequences: "Fatigue during long EVAs or surface traverses.",
    monitoring: "Endurance tests, VO₂max, EVA metabolic rates.",
    visual: "Leg muscles pulse slowly in the severity colour; no shape change, since endurance loss is about capacity, not size.",
    evidenceNote: "Established concern; the pulsing is a symbolic representation.",
    response: "Educational outline: interval and aerobic training.",
    stages: ["Baseline", "Mild reduction", "Moderate reduction", "Marked reduction"],
    indicators: [{ label: "Time to fatigue", unit: "% preflight", values: [100, 90, 78, 66, 66], decimals: 0 }],
    fx: {
      targets: [...QUADS, ...CALF, ...HAMS],
      primary: "muscular",
      anchor: { mesh: "PROC_muscle_vastus_lat_1", at: MID },
    },
  },
  {
    id: "physical_deconditioning",
    name: "Physical Deconditioning",
    category: "muscular",
    evidence: "documented",
    affected: ["Postural muscles", "Arm muscles", "Heart"],
    mechanism: "Combined loss of muscle, strength, and aerobic fitness reduces overall physical capacity.",
    relevance: "NASA tracks reduced cardiorespiratory and musculoskeletal fitness as a risk for long missions.",
    environment: "Whole-body unloading plus reduced daily activity.",
    consequences: "Lower work capacity and higher injury risk during demanding tasks.",
    monitoring: "Fitness test battery: strength, VO₂max, functional tasks.",
    visual: "Leg, back and arm muscles shrink slightly and the heart is highlighted.",
    evidenceNote: "Established; magnitudes depend on exercise countermeasures.",
    response: "Educational outline: integrated exercise programme and pre-landing reconditioning plan.",
    stages: ["Baseline", "Mild", "Moderate", "Marked"],
    indicators: [
      { label: "Work capacity", unit: "% preflight", values: [100, 92, 84, 74, 74], decimals: 0 },
      { label: "Aerobic capacity", unit: "% preflight", values: [100, 95, 88, 80, 80], decimals: 0 },
    ],
    fx: {
      targets: [...POSTURAL, ...ARMS, HEART],
      primary: "muscular",
      anchor: { mesh: "PROC_muscle_delt_lat_1", at: MID },
      shrink: true,
    },
  },
  {
    id: "muscle_injury",
    name: "Simulated Muscle Injury",
    category: "muscular",
    evidence: "general",
    affected: ["Left hamstring (illustrative)"],
    mechanism: "Muscle fibres tear under a sudden or excessive load, causing pain, swelling and weakness.",
    relevance: "A general injury that can happen during exercise or EVA. Deconditioned muscles after flight may be more vulnerable.",
    environment: "Not caused by microgravity; risk rises with heavy exercise loads and on return to gravity.",
    consequences: "Pain and reduced function for days to weeks.",
    monitoring: "Pain and strength assessment, ultrasound where available.",
    visual: "An injury marker pulses on the left hamstring, which changes colour with severity.",
    evidenceNote: "General sports medicine. The location is illustrative.",
    response: "Educational outline: rest, ice packs, compression, then graded rehabilitation.",
    stages: ["Healthy", "Strain", "Partial tear", "Major tear"],
    indicators: [{ label: "Strength (affected side)", unit: "% normal", values: [100, 80, 55, 25, 25], decimals: 0 }],
    fx: {
      targets: ["PROC_muscle_ham_lat_1", "PROC_muscle_ham_med_1"],
      primary: "muscular",
      anchor: { mesh: "PROC_muscle_ham_lat_1", at: MID },
      marker: { mesh: "PROC_muscle_ham_lat_1", at: C(0.5, 0.55, 0.5), kind: "injury" },
    },
  },

  /* ================================ SKELETAL =============================== */
  {
    id: "bone_loss",
    name: "Spaceflight-Induced Bone Loss",
    category: "skeletal",
    evidence: "documented",
    affected: ["Pelvis and hips", "Lumbar spine", "Leg bones"],
    mechanism: "Bone is broken down faster than it is rebuilt, so weight-bearing bones lose mineral and their internal lattice thins.",
    relevance:
      "Weight-bearing bones such as the hip and spine have lost roughly 1 to 1.5% of mineral density per month in long-duration flight without effective countermeasures.",
    environment: "Bones respond to mechanical load. Without gravity, bone-resorbing cells win over bone-building cells.",
    consequences: "Weaker bones, higher fracture risk, and recovery that can take years after return.",
    monitoring: "DXA and QCT scans before and after flight, bone turnover markers in blood and urine.",
    visual:
      "The pelvis, spine and leg bones turn amber and their surface lattice thins out (porosity) as stages advance.",
    evidenceNote:
      "Established: regional bone loss in flight. Simplified: the lattice thinning is exaggerated to make the change visible.",
    response: "Educational outline: resistance exercise, adequate calcium and vitamin D; medication has been studied.",
    stages: ["Baseline density", "Early loss", "Moderate loss", "Marked loss"],
    indicators: [
      { label: "Hip bone density", unit: "% preflight", values: [100, 98, 95, 91, 91], decimals: 1 },
      { label: "Bone resorption marker", unit: "% baseline", values: [100, 130, 160, 190, 190], decimals: 0 },
    ],
    fx: {
      targets: [PELVIS, SPINE, LEG_BONES],
      primary: "skeletal",
      anchor: { mesh: PELVIS, at: C(0.75, 0.5, 0.5) },
      porosity: true,
    },
  },
  {
    id: "reduced_bmd",
    name: "Reduced Bone Mineral Density",
    category: "skeletal",
    evidence: "associated",
    affected: ["Femoral neck", "Pelvis"],
    mechanism: "The amount of mineral per area of bone decreases, measured as bone mineral density (BMD).",
    relevance: "BMD at the hip is a standard measure used to track astronauts before and after flight.",
    environment: "Unloading reduces bone formation and increases resorption.",
    consequences: "Lower BMD is linked to lower bone strength.",
    monitoring: "DXA scans; QCT for 3D structure.",
    visual: "Hip and thigh bones show the lattice thinning; the cross-section panel compares normal and reduced density.",
    evidenceNote: "Established measure; the visual porosity is illustrative.",
    response: "Educational outline: exercise and nutrition countermeasures, post-flight follow-up.",
    stages: ["Baseline", "Mild reduction", "Moderate reduction", "Marked reduction"],
    indicators: [{ label: "Femoral neck BMD", unit: "% preflight", values: [100, 98, 95, 92, 92], decimals: 1 }],
    fx: {
      targets: [PELVIS, LEG_BONES],
      primary: "skeletal",
      anchor: { mesh: LEG_BONES, at: C(0.7, 0.85, 0.5) },
      porosity: true,
    },
  },
  {
    id: "fracture_risk",
    name: "Increased Fracture Risk",
    category: "skeletal",
    evidence: "documented",
    affected: ["Hip", "Spine", "Leg bones"],
    mechanism: "Thinner, weaker bone can break under loads that healthy bone would tolerate.",
    relevance: "NASA tracks bone fracture risk because of in-flight bone loss and the loads of landing and surface EVA.",
    environment: "Bone weakened in flight meets higher loads on landing or on a planet.",
    consequences: "A fracture far from Earth would be difficult to treat.",
    monitoring: "BMD and bone-strength estimates, load monitoring during exercise and EVA.",
    visual: "Hip, spine and leg bones thin out and pulse at the most loaded regions.",
    evidenceNote: "Established risk concept; actual fracture probability is individual and uncertain.",
    response: "Educational outline: maintain bone through exercise, limit high-impact loads after landing.",
    stages: ["Baseline", "Elevated", "High", "Very high"],
    indicators: [{ label: "Estimated bone strength", unit: "% preflight", values: [100, 96, 90, 84, 84], decimals: 0 }],
    fx: {
      targets: [PELVIS, SPINE, LEG_BONES],
      primary: "skeletal",
      anchor: { mesh: PELVIS, at: C(0.3, 0.4, 0.5) },
      porosity: true,
    },
  },
  {
    id: "bone_fracture",
    name: "Simulated Bone Fracture",
    category: "skeletal",
    evidence: "general",
    affected: ["Left femur (illustrative)"],
    mechanism: "A bone breaks under load. The fracture interrupts the bone and damages surrounding tissue.",
    relevance: "A general injury. Bone loss in flight could make fractures more likely during landing or surface EVA.",
    environment: "Microgravity does not cause fractures directly; weakened bone plus high loads raises the risk.",
    consequences: "Pain, loss of function, bleeding, and a long recovery.",
    monitoring: "Clinical exam, ultrasound or imaging where available.",
    visual: "A fracture ring appears on the left thigh bone, which changes colour with severity.",
    evidenceNote: "General orthopaedics. The fracture location is illustrative.",
    response: "Educational outline: immobilize with a splint, manage pain, and consult the ground.",
    stages: ["Intact bone", "Stress reaction", "Hairline fracture", "Complete fracture", "Displaced fracture"],
    indicators: [{ label: "Weight-bearing ability", unit: "% normal", values: [100, 75, 40, 0, 0], decimals: 0 }],
    fx: {
      targets: [LEG_BONES],
      primary: "skeletal",
      anchor: { mesh: LEG_BONES, at: C(0.72, 0.72, 0.5) },
      marker: { mesh: LEG_BONES, at: C(0.72, 0.72, 0.5), kind: "fracture" },
    },
  },
  {
    id: "calcium_loss",
    name: "Calcium Loss & Altered Bone Metabolism",
    category: "skeletal",
    evidence: "associated",
    affected: ["Skeleton (calcium reservoir)", "Kidneys (calcium excretion)"],
    mechanism: "Calcium released from resorbed bone enters the blood and is excreted by the kidneys.",
    relevance: "Increased urinary calcium is a consistent finding in flight and links bone loss to kidney stone risk.",
    environment: "Unloading accelerates bone resorption.",
    consequences: "Net calcium loss from the body; higher stone risk.",
    monitoring: "Urinary calcium, bone turnover markers.",
    visual: "Bones thin out while the kidneys change colour, showing where the calcium goes.",
    evidenceNote: "Established finding; the visual coupling is simplified.",
    response: "Educational outline: exercise, adequate fluid intake, dietary review.",
    stages: ["Baseline", "Elevated loss", "High loss", "Very high loss"],
    indicators: [{ label: "Urinary calcium", unit: "% preflight", values: [100, 125, 150, 180, 180], decimals: 0 }],
    fx: {
      targets: [PELVIS, SPINE, LEG_BONES, KIDNEYS],
      primary: "skeletal",
      anchor: { mesh: SPINE, at: C(0.5, 0.3, 0.5) },
      porosity: true,
    },
  },

  /* =================================== EYES ================================ */
  {
    id: "optic_disc_edema",
    name: "Optic Disc Edema",
    category: "eyes",
    evidence: "associated",
    affected: ["Optic nerve head (left eye shown)", "Optic nerve"],
    mechanism: "The point where the optic nerve enters the eye swells.",
    relevance: "Optic disc edema is one of the key findings that define SANS in long-duration crew.",
    environment: "Thought to relate to the headward fluid shift and altered pressures around the optic nerve; not fully understood.",
    consequences: "Usually mild visual effects; long-term significance is still being studied.",
    monitoring: "OCT imaging of the optic nerve head, fundoscopy.",
    visual: "A swelling marker grows at the back of the left eye and the optic nerves change colour.",
    evidenceNote: "Established finding within SANS; cause uncertain. The marker is illustrative.",
    response: "Educational outline: regular OCT imaging and ground ophthalmology review.",
    stages: ["Normal disc", "Mild swelling", "Moderate swelling", "Marked swelling"],
    indicators: [{ label: "Retinal nerve fibre thickness", unit: "% baseline", values: [100, 108, 118, 130, 130], decimals: 0 }],
    fx: {
      targets: [EYES, CHIASM],
      primary: "brain",
      anchor: { mesh: EYE_L, at: MID },
      opticNerve: true,
      marker: { mesh: EYE_L, at: C(0.5, 0.5, 0.1), kind: "edema" },
    },
  },
  {
    id: "visual_function_change",
    name: "Changes in Visual Function",
    category: "eyes",
    evidence: "associated",
    affected: ["Both eyes (globe shape and focusing)", "Posterior globe"],
    mechanism: "Near vision becomes blurrier as the eye's focusing shifts toward far-sightedness (hyperopic shift).",
    relevance: "Many long-duration crew report reduced near vision; adjustable or stronger glasses are flown for this reason.",
    environment: "Linked to globe flattening within SANS.",
    consequences: "Difficulty reading displays and checklists without correction.",
    monitoring: "Visual acuity tests, refraction checks.",
    visual: "Both eyes change colour with severity; the optic nerves are shown for context.",
    evidenceNote: "Established; magnitude varies between individuals.",
    response: "Educational outline: corrective lenses and scheduled eye exams.",
    stages: ["Normal", "Mild shift", "Moderate shift", "Marked shift"],
    indicators: [{ label: "Refractive shift", unit: "diopters", values: [0, 0.25, 0.75, 1.5, 1.5], decimals: 2 }],
    fx: {
      targets: [EYES],
      primary: "brain",
      anchor: { mesh: EYE_L, at: MID },
      opticNerve: true,
    },
  },
  {
    id: "eye_injury",
    name: "Simulated Eye Injury",
    category: "eyes",
    evidence: "general",
    affected: ["Cornea of the left eye (illustrative)"],
    mechanism: "A foreign body or scratch damages the clear front surface of the eye.",
    relevance: "Floating debris in microgravity does not settle, and eye irritation from particles has been reported in flight.",
    environment: "Dust and debris float in the cabin instead of falling to the floor.",
    consequences: "Pain, tearing, light sensitivity, and blurred vision.",
    monitoring: "Eye exam with fluorescein stain, visual acuity.",
    visual: "An injury marker pulses on the front of the left eye.",
    evidenceNote: "General ophthalmology; the location is illustrative.",
    response: "Educational outline: irrigate the eye, antibiotic drops if indicated, and protect the eye.",
    stages: ["Healthy", "Irritation", "Abrasion", "Deep injury"],
    indicators: [{ label: "Visual acuity (affected eye)", unit: "% normal", values: [100, 92, 75, 50, 50], decimals: 0 }],
    fx: {
      targets: [EYE_L],
      primary: "brain",
      anchor: { mesh: EYE_L, at: C(0.5, 0.5, 0.9) },
      marker: { mesh: EYE_L, at: C(0.5, 0.55, 0.95), kind: "injury" },
    },
  },

  /* =========================== KIDNEYS & URINARY =========================== */
  {
    id: "kidney_stone",
    name: "Kidney Stone Formation",
    category: "renal",
    evidence: "documented",
    affected: ["Left kidney (illustrative)", "Ureter", "Bladder"],
    mechanism: "Minerals crystallize in the urine and grow into a stone that can block urine flow.",
    relevance:
      "NASA tracks renal stone formation as a risk: bone loss raises urinary calcium and lower fluid intake concentrates the urine.",
    environment: "Bone resorption in microgravity and reduced urine volume both favour crystal formation.",
    consequences: "Severe pain and possible blockage of the urinary tract; a serious problem far from surgery.",
    monitoring: "Urine chemistry, hydration, ultrasound of the kidneys.",
    visual: "A stone grows inside the left kidney and urine particles back up behind it.",
    evidenceNote: "Established risk; stone location and growth speed are illustrative.",
    response: "Educational outline: hydration, dietary measures, and medication studied for prevention.",
    stages: ["No stone", "Microcrystals", "Small stone", "Obstructing stone", "Complete obstruction"],
    indicators: [
      { label: "Urine flow (left)", unit: "% normal", values: [100, 95, 75, 35, 5], decimals: 0 },
      { label: "Pain score", unit: "0–10", values: [0, 0, 3, 7, 9], decimals: 0 },
    ],
    fx: {
      targets: [KIDNEY_L, BLADDER],
      primary: "kidneys",
      anchor: { mesh: KIDNEY_L, at: MID },
      marker: { mesh: KIDNEY_L, at: C(0.35, 0.35, 0.5), kind: "stone" },
      urine: "reduced",
    },
  },
  {
    id: "dehydration",
    name: "Dehydration",
    category: "renal",
    evidence: "associated",
    affected: ["Kidneys", "Blood volume"],
    mechanism: "The body has less water than it needs, so the kidneys conserve water and urine becomes concentrated.",
    relevance: "Crew often drink less in flight, and the early fluid shift causes the body to shed fluid.",
    environment: "Thirst is blunted in microgravity; heavy EVA work adds sweat losses.",
    consequences: "Fatigue, headache, higher stone risk, and worse tolerance of standing after landing.",
    monitoring: "Fluid intake logs, urine colour or concentration, body mass.",
    visual: "Kidneys change colour and urine particles slow down.",
    evidenceNote: "Established physiology; simulated values show trends only.",
    response: "Educational outline: scheduled drinking and monitoring of urine output.",
    stages: ["Hydrated", "Mild deficit", "Moderate deficit", "Severe deficit"],
    indicators: [{ label: "Urine output", unit: "% normal", values: [100, 75, 50, 30, 30], decimals: 0 }],
    fx: {
      targets: [KIDNEYS],
      primary: "kidneys",
      anchor: { mesh: KIDNEY_L, at: MID },
      urine: "reduced",
    },
  },
  {
    id: "fluid_balance",
    name: "Fluid Balance Disturbance",
    category: "renal",
    evidence: "associated",
    affected: ["Kidneys", "Plasma volume", "Head and neck veins"],
    mechanism: "Body fluid is redistributed and total plasma volume decreases as the kidneys adjust to the new distribution.",
    relevance: "The headward fluid shift and plasma volume loss of about 10 to 15% are hallmark early adaptations.",
    environment: "Without gravity, fluid moves from the legs to the upper body; the body interprets this as excess and sheds fluid.",
    consequences: "Puffy face, thin legs, and reduced plasma volume that matters on return to gravity.",
    monitoring: "Body mass, leg volume, plasma volume estimates.",
    visual: "Jugular veins carry a headward-heavy flow while the kidneys change colour.",
    evidenceNote: "Established adaptation; the visual is a simplified illustration.",
    response: "Educational outline: fluid and salt loading before landing.",
    stages: ["Balanced", "Early shift", "Established shift", "Marked imbalance"],
    indicators: [{ label: "Plasma volume", unit: "% baseline", values: [100, 94, 89, 85, 85], decimals: 0 }],
    fx: {
      targets: [KIDNEYS, IJV_L, IJV_R],
      primary: "kidneys",
      anchor: { mesh: KIDNEY_L, at: MID },
      flow: { mesh: LEG_VEIN_L, from: "bottom", mode: "cephalad" },
    },
  },
  {
    id: "urinary_retention",
    name: "Urinary Retention",
    category: "renal",
    evidence: "associated",
    affected: ["Bladder", "Bladder outflow"],
    mechanism: "The bladder does not empty fully or at all.",
    relevance: "Urinary retention has been reported in flight, particularly early in missions and with some medications.",
    environment: "Without gravity, urine does not settle at the bladder outlet, and the sensation of fullness can be altered.",
    consequences: "Discomfort and infection risk; catheterization may be needed.",
    monitoring: "Urine output, bladder ultrasound.",
    visual: "The bladder changes colour and urine particles accumulate instead of draining.",
    evidenceNote: "Reported in flight; prevalence is not well defined.",
    response: "Educational outline: review medications; catheter kits are carried.",
    stages: ["Normal emptying", "Incomplete emptying", "Significant retention", "Complete retention"],
    indicators: [{ label: "Bladder volume", unit: "% capacity", values: [30, 55, 80, 100, 100], decimals: 0 }],
    fx: {
      targets: [BLADDER],
      primary: "kidneys",
      anchor: { mesh: BLADDER, at: MID },
      urine: "retention",
    },
  },
  {
    id: "altered_calcium",
    name: "Altered Calcium Handling",
    category: "renal",
    evidence: "associated",
    affected: ["Kidneys", "Skeleton"],
    mechanism: "The kidneys excrete more calcium than usual because bone is releasing it.",
    relevance: "Higher urinary calcium in flight is the main link between bone loss and kidney stone risk.",
    environment: "Unloading-driven bone resorption.",
    consequences: "Supersaturated urine and higher stone risk.",
    monitoring: "24-hour urine calcium, hydration.",
    visual: "Kidneys change colour while the pelvis and spine thin, connecting bone and kidney.",
    evidenceNote: "Established finding; visual coupling simplified.",
    response: "Educational outline: hydration and bone-protective exercise.",
    stages: ["Baseline", "Elevated", "High", "Very high"],
    indicators: [{ label: "Urinary calcium", unit: "% preflight", values: [100, 125, 150, 180, 180], decimals: 0 }],
    fx: {
      targets: [KIDNEYS, PELVIS, SPINE],
      primary: "kidneys",
      anchor: { mesh: KIDNEY_L, at: MID },
      porosity: true,
    },
  },

  /* ================================= IMMUNE ================================ */
  {
    id: "altered_immune",
    name: "Altered Immune Response",
    category: "immune",
    evidence: "documented",
    affected: ["Lymph nodes and vessels", "Immune cells"],
    mechanism: "Some immune cells change how they respond; activity can be dampened in some pathways and inflamed in others.",
    relevance: "NASA tracks altered immune response as a risk; changes in immune cell function have been measured in crew.",
    environment: "Contributors include stress hormones, disrupted sleep, radiation, and microgravity effects on cells.",
    consequences: "Possible effects on infection defence, allergies, and latent virus control. Clinical impact varies by individual.",
    monitoring: "Blood immune markers, symptom tracking, viral shedding tests.",
    visual: "The lymphatic network is highlighted and violet immune-cell particles become fewer and dimmer.",
    evidenceNote: "Established: measurable immune changes. Not every astronaut is affected; the particle effect is symbolic.",
    response: "Educational outline: sleep, nutrition, and stress management; continued monitoring.",
    stages: ["Baseline", "Mild change", "Moderate change", "Marked change"],
    indicators: [{ label: "Immune activity index", unit: "% baseline", values: [100, 90, 78, 65, 65], decimals: 0 }],
    fx: {
      targets: [LYMPH],
      primary: null,
      anchor: { mesh: LYMPH, at: C(0.5, 0.6, 0.5) },
      immune: "reduced",
    },
  },
  {
    id: "viral_reactivation",
    name: "Viral Reactivation",
    category: "immune",
    evidence: "associated",
    affected: ["Lymphatic system", "Latent herpesviruses"],
    mechanism: "Viruses that stay dormant in the body (such as Epstein-Barr, varicella-zoster and cytomegalovirus) become active again.",
    relevance: "Increased shedding of latent herpesviruses has been measured in astronauts during flight; most cases cause no symptoms.",
    environment: "Stress and altered immune function are thought to reduce control of latent viruses.",
    consequences: "Usually asymptomatic; occasionally skin rashes or other symptoms.",
    monitoring: "Viral DNA in saliva or urine, skin checks.",
    visual: "Clusters of activated particles flare along the lymphatic network.",
    evidenceNote: "Established: increased shedding. Uncertain: clinical significance on long missions.",
    response: "Educational outline: monitoring; antiviral medication is carried for symptomatic cases.",
    stages: ["Dormant", "Low shedding", "Moderate shedding", "High shedding"],
    indicators: [{ label: "Viral shedding", unit: "relative", values: [1, 3, 6, 10, 10], decimals: 0 }],
    fx: {
      targets: [LYMPH],
      primary: null,
      anchor: { mesh: LYMPH, at: C(0.5, 0.75, 0.5) },
      immune: "reactivation",
    },
  },
  {
    id: "infection_susceptibility",
    name: "Increased Infection Susceptibility",
    category: "immune",
    evidence: "hypothetical",
    affected: ["Immune system"],
    mechanism: "If immune defences are weaker, infections could take hold more easily.",
    relevance:
      "This is a proposed consequence of immune changes. Clinical infection rates in flight are low and the data are limited.",
    environment: "Possible contributors: immune changes plus microbes that behave differently in closed spacecraft environments.",
    consequences: "Hypothetically, more frequent or more severe infections on long missions.",
    monitoring: "Symptoms, temperature, immune markers.",
    visual: "Immune particles thin out across the lymphatic network.",
    evidenceNote: "Hypothetical: no specific infection is claimed, and not every astronaut is affected.",
    response: "Educational outline: hygiene, environmental monitoring, and medical kit planning.",
    stages: ["Baseline", "Slightly raised", "Raised", "Highly raised"],
    indicators: [{ label: "Immune activity index", unit: "% baseline", values: [100, 90, 80, 70, 70], decimals: 0 }],
    fx: {
      targets: [LYMPH],
      primary: null,
      anchor: { mesh: LYMPH, at: C(0.5, 0.5, 0.5) },
      immune: "reduced",
    },
  },
  {
    id: "infection_response",
    name: "Simulated Infection Response",
    category: "immune",
    evidence: "hypothetical",
    affected: ["Lymph nodes", "Immune cells", "Body temperature"],
    mechanism: "Immune cells gather and activate at a site of infection, raising temperature and heart rate.",
    relevance: "Hypothetical teaching scenario; no specific infection is modelled.",
    environment: "Not a microgravity effect; illustrates the general immune response.",
    consequences: "Fever, fatigue, and reduced performance.",
    monitoring: "Temperature, heart rate, heart rate variability, symptoms.",
    visual: "Violet immune particles converge on a cluster in the chest lymph nodes.",
    evidenceNote: "Hypothetical and simplified; the site is illustrative.",
    response: "Educational outline: monitor temperature, rest, fluids, and consult the ground.",
    stages: ["Baseline", "Early response", "Active response", "Strong response", "Systemic response"],
    indicators: [
      { label: "Core temperature", unit: "°C", values: [36.8, 37.3, 38.0, 38.7, 39.4], decimals: 1 },
      { label: "Heart rate", unit: "bpm", values: [64, 72, 84, 96, 112], decimals: 0 },
    ],
    fx: {
      targets: [LYMPH],
      primary: null,
      anchor: { mesh: LYMPH, at: C(0.5, 0.72, 0.6) },
      immune: "cluster",
    },
  },

  /* ============================ DIGESTIVE (EXTRA) ========================== */
  {
    id: "space_motion_sickness",
    name: "Space Motion Sickness (Nausea)",
    category: "digestive",
    evidence: "documented",
    affected: ["Stomach", "Vestibular system"],
    mechanism: "Conflicting balance signals trigger nausea and sometimes vomiting through brainstem pathways.",
    relevance: "Common in the first days of flight; part of NASA's sensorimotor risk.",
    environment: "Sensory conflict from the inner ear in weightlessness.",
    consequences: "Reduced appetite and fluid intake, lower work capacity early in the mission.",
    monitoring: "Symptom scores, fluid intake, medication use.",
    visual: "The stomach and inner ears change colour with severity.",
    evidenceNote: "Established; usually resolves within a few days.",
    response: "Educational outline: anti-nausea medication and limited head movement early in flight.",
    stages: ["No symptoms", "Mild nausea", "Moderate nausea", "Vomiting"],
    indicators: [{ label: "Symptom score", unit: "0–20", values: [0, 4, 9, 15, 15], decimals: 0 }],
    fx: {
      targets: [STOMACH, EARS],
      primary: "stomach",
      anchor: { mesh: STOMACH, at: MID },
    },
  },
  {
    id: "glucose_regulation",
    name: "Altered Glucose Regulation",
    category: "digestive",
    evidence: "associated",
    affected: ["Pancreas", "Liver", "Muscle glucose uptake"],
    mechanism: "Cells respond less to insulin, so blood sugar control becomes less efficient.",
    relevance: "Reduced insulin sensitivity has been seen in spaceflight and in bed-rest studies that mimic it.",
    environment: "Physical inactivity and muscle unloading reduce glucose uptake by muscle.",
    consequences: "Mostly mild metabolic changes; relevance for very long missions is being studied.",
    monitoring: "Blood glucose, glucose tolerance tests.",
    visual: "The pancreas and liver change colour with severity.",
    evidenceNote: "Observed in flight and analogues; magnitude and significance uncertain.",
    response: "Educational outline: exercise and diet planning.",
    stages: ["Baseline", "Mild change", "Moderate change", "Marked change"],
    indicators: [{ label: "Insulin sensitivity", unit: "% baseline", values: [100, 90, 78, 66, 66], decimals: 0 }],
    fx: {
      targets: [PANCREAS, LIVER],
      primary: "pancreas",
      anchor: { mesh: "PROC_pancreas_head", at: MID },
    },
  },
  {
    id: "acute_abdomen",
    name: "Acute Abdominal Emergency (Appendicitis)",
    category: "digestive",
    evidence: "general",
    affected: ["Lower right large intestine (appendix region)"],
    mechanism: "The appendix becomes inflamed and can rupture, causing infection in the abdomen.",
    relevance:
      "A general emergency that is a classic planning concern for exploration missions because surgery would not be available.",
    environment: "Not caused by spaceflight.",
    consequences: "Severe pain, fever, and life-threatening infection if untreated.",
    monitoring: "Abdominal exam, temperature, ultrasound.",
    visual: "A dark inflamed zone appears in the lower right abdomen.",
    evidenceNote: "General surgery; the location is approximate.",
    response: "Educational outline: antibiotics per protocol and urgent ground consultation.",
    stages: ["Healthy", "Early inflammation", "Inflamed appendix", "Perforation risk", "Perforation"],
    indicators: [
      { label: "Core temperature", unit: "°C", values: [36.8, 37.2, 37.9, 38.6, 39.3], decimals: 1 },
      { label: "Pain score", unit: "0–10", values: [0, 3, 6, 8, 9], decimals: 0 },
    ],
    fx: {
      targets: [LARGE_INTESTINE, SMALL_INTESTINE],
      primary: "large_intestine",
      anchor: { mesh: LARGE_INTESTINE, at: C(0.15, 0.25, 0.6) },
      hotspot: { mesh: LARGE_INTESTINE, at: C(0.1, 0.2, 0.6), radius: 0.035 },
    },
  },
];

export const EMERGENCY_BY_ID: Record<string, EmergencyScenario> = Object.fromEntries(
  EMERGENCY_SCENARIOS.map((s) => [s.id, s]),
);

const ids = (cat: EmergencyCategoryId) => EMERGENCY_SCENARIOS.filter((s) => s.category === cat).map((s) => s.id);

export const EMERGENCY_CATEGORIES: EmergencyCategory[] = [
  {
    id: "cardiovascular",
    label: "Heart & blood vessels",
    short: "Cardio",
    description: "Venous flow, thrombosis, rhythm, deconditioning",
    focusOrgan: "heart",
    scenarioIds: ids("cardiovascular"),
  },
  {
    id: "neuro",
    label: "Brain & nervous system",
    short: "Neuro",
    description: "SANS, vestibular, cognition, headache",
    focusOrgan: "brain",
    scenarioIds: ["sans", ...ids("neuro").filter((x) => x !== "sans")],
  },
  {
    id: "respiratory",
    label: "Lungs & life support",
    short: "Resp",
    description: "Hypoxia, hypercapnia, suit and cabin failures",
    focusOrgan: "lungs",
    scenarioIds: ids("respiratory"),
  },
  {
    id: "muscular",
    label: "Muscles",
    short: "Muscle",
    description: "Atrophy, strength, endurance, injury",
    focusOrgan: "muscular",
    scenarioIds: ids("muscular"),
  },
  {
    id: "skeletal",
    label: "Bones",
    short: "Bone",
    description: "Bone loss, density, fracture",
    focusOrgan: "skeletal",
    scenarioIds: ids("skeletal"),
  },
  {
    id: "eyes",
    label: "Eyes & vision",
    short: "Eyes",
    description: "SANS, optic disc edema, vision, injury",
    focusOrgan: "brain",
    scenarioIds: ["sans", ...ids("eyes")],
  },
  {
    id: "renal",
    label: "Kidneys & urinary",
    short: "Renal",
    description: "Stones, hydration, fluid balance, retention",
    focusOrgan: "kidneys",
    scenarioIds: ids("renal"),
  },
  {
    id: "immune",
    label: "Immune system",
    short: "Immune",
    description: "Immune changes, viral reactivation, infection",
    focusOrgan: null,
    scenarioIds: ids("immune"),
  },
  {
    id: "digestive",
    label: "Digestive & metabolic",
    short: "Digest",
    description: "Motion sickness, glucose, acute abdomen",
    focusOrgan: "stomach",
    scenarioIds: ids("digestive"),
  },
];

export const EMERGENCY_CATEGORY_BY_ID: Record<EmergencyCategoryId, EmergencyCategory> = Object.fromEntries(
  EMERGENCY_CATEGORIES.map((c) => [c.id, c]),
) as Record<EmergencyCategoryId, EmergencyCategory>;

/** Which emergency directory opens when an organ is clicked in the 3D model. */
export function categoryForOrgan(organId: AnatomyId | null, meshName?: string | null): EmergencyCategoryId | null {
  if (meshName) {
    if (meshName.startsWith("ORG_eye") || meshName === CHIASM) return "eyes";
    if (meshName.startsWith("PROC_vein") || meshName === ARTERIES) return "cardiovascular";
    if (meshName.startsWith("PROC_muscle")) return "muscular";
    if (meshName.startsWith("ORG_bladder")) return "renal";
  }
  switch (organId) {
    case "heart":
    case "circulatory":
      return "cardiovascular";
    case "brain":
    case "nervous":
      return "neuro";
    case "lungs":
      return "respiratory";
    case "muscular":
      return "muscular";
    case "skeletal":
    case "spine":
      return "skeletal";
    case "kidneys":
      return "renal";
    case "stomach":
    case "liver":
    case "pancreas":
    case "small_intestine":
    case "large_intestine":
      return "digestive";
    default:
      return null;
  }
}

export function maxLevel(s: EmergencyScenario): SeverityLevel {
  return Math.min(4, Math.max(1, s.stages.length - 1)) as SeverityLevel;
}

export function indicatorValue(ind: Indicator, level: number): number {
  const lv = Math.max(0, Math.min(4, level));
  const lo = Math.floor(lv);
  const hi = Math.min(4, lo + 1);
  const t = lv - lo;
  return ind.values[lo] + (ind.values[hi] - ind.values[lo]) * t;
}

/** Continuous severity (0..4) to colour, blending through the palette. */
export function severityHex(level: number): string {
  const stops = ["#00E5FF", "#FFD45C", "#FF8C42", "#FF3158", "#FF3158"];
  const lv = Math.max(0, Math.min(4, level));
  const lo = Math.floor(lv);
  const hi = Math.min(4, lo + 1);
  const t = lv - lo;
  const a = parseInt(stops[lo].slice(1), 16);
  const b = parseInt(stops[hi].slice(1), 16);
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, "0")}`;
}

/** The eight assistant questions, answered from the local knowledge base. */
export function explanationSections(s: EmergencyScenario): { q: string; a: string }[] {
  return [
    { q: "What is happening inside the body?", a: s.mechanism },
    { q: "Which anatomical structures are affected?", a: s.affected.join(", ") + "." },
    { q: "Why can this occur during spaceflight?", a: s.relevance },
    { q: "How does microgravity or the mission environment contribute?", a: s.environment },
    { q: "What physiological consequences may follow?", a: s.consequences },
    { q: "Which indicators can be monitored?", a: s.monitoring },
    { q: "What does the 3D simulation represent?", a: s.visual },
    { q: "What is established, and what is simplified?", a: s.evidenceNote },
  ];
}

/** Route a free-text question to the most relevant knowledge-base answer. */
export function answerLocally(s: EmergencyScenario, question: string): { q: string; a: string } {
  const sections = explanationSections(s);
  const qn = question.toLowerCase();
  const rules: [RegExp, number][] = [
    [/(why|cause|risk|happen in space|astronaut)/, 2],
    [/(microgravity|gravity|weightless|environment|fluid shift)/, 3],
    [/(structure|organ|where|which part|anatomy|affect)/, 1],
    [/(consequence|danger|serious|outcome|effect|happen next|complication)/, 4],
    [/(monitor|measure|sensor|detect|test|indicator|value)/, 5],
    [/(visual|animation|color|colour|red|particle|see|show|3d|simulation)/, 6],
    [/(evidence|proof|established|certain|real|true|simplif|accurate|study)/, 7],
    [/(treat|do|respond|countermeasure|prevent|fix|help)/, -1],
    [/(what is|explain|mechanism|how does|inside)/, 0],
  ];
  for (const [re, idx] of rules) {
    if (re.test(qn)) {
      if (idx === -1) return { q: "Suggested educational response", a: s.response };
      return sections[idx];
    }
  }
  return sections[0];
}
