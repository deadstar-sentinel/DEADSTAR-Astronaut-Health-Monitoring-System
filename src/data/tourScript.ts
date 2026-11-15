/**
 * The narrated cinematic walkthrough. Each shot pairs an app action with a camera move and
 * two narrations: plain language for everyone, and a clinical version for experts.
 * Facts match the emergency scenario library (sources in src/data/emergencyScenarios.ts).
 */
import type { CinematicShot } from "../three/MedicalViewport.ts";

export type Audience = "simple" | "expert";

export type TourAction =
  | "reset"
  | "chest"
  | "xray_head"
  | "co2_l1"
  | "co2_l4"
  | "suit_on"
  | "countermeasure"
  | "clot"
  | "finish";

export interface TourShot {
  title: string;
  action: TourAction;
  shot: CinematicShot;
  /** Wait this long (ms) after the action before moving the camera (lets the scene update). */
  shotDelay?: number;
  /** Minimum time on this shot (ms), even if narration is shorter or off. */
  minMs: number;
  simple: string;
  expert: string;
}

export const TOUR: TourShot[] = [
  {
    title: "Mission",
    action: "reset",
    shot: { focus: { kind: "body" }, distance: 3.4, azimuth: -32, elevation: 8, duration: 3.2, orbit: 52, orbitDuration: 16 },
    minMs: 7000,
    simple:
      "Hello, I'm Lifeline. I travel with the crew as their flight surgeon. Out here, a message to Earth takes minutes, so when every second counts, I act right here on board.",
    expert:
      "Lifeline is an autonomous onboard medical officer. With Mars one-way light time of up to twenty-two minutes, it acts on board whenever Earth's round trip plus ground assessment would miss the action deadline.",
  },
  {
    title: "Digital twin",
    action: "chest",
    shot: { focus: { kind: "organ", id: "heart" }, distance: 1.25, azimuth: 24, elevation: 4, duration: 2.8, orbit: -34, orbitDuration: 12 },
    minMs: 6500,
    simple:
      "This is a living digital twin of an astronaut. Every organ is watched around the clock, and I forecast how each one will be doing in the hours ahead.",
    expert:
      "Each crew member has a digital twin. Every organ maps to one of NASA's seventeen Human Research Program risks, with hourly and daily forecasts carrying back-tested eighty and ninety-five percent bands.",
  },
  {
    title: "Skull & brain",
    action: "xray_head",
    shot: { focus: { kind: "organ", id: "brain" }, distance: 0.62, azimuth: -28, elevation: 6, duration: 2.8, orbit: 56, orbitDuration: 12 },
    minMs: 7000,
    simple:
      "Here's the skull and brain. On long missions, fluid shifts toward the head and can change the eyes, so I keep a close watch on them.",
    expert:
      "In X-ray, the reconstructed skull and brain. Spaceflight-associated neuro-ocular syndrome, linked to the headward fluid shift, is tracked through optic nerve sheath diameter and refraction.",
  },
  {
    title: "Emergency",
    action: "co2_l1",
    shot: { focus: { kind: "organ", id: "lungs" }, distance: 0.95, azimuth: 16, elevation: 4, duration: 2.6, orbit: -22, orbitDuration: 10 },
    shotDelay: 250,
    minMs: 6500,
    simple:
      "Now let's see an emergency. The machine that cleans carbon dioxide from the air starts to fail. Notice that only the lungs change colour. Everything healthy stays calm and blue.",
    expert:
      "Emergency simulation: CO2 scrubber degradation. Only affected structures change state, so the anatomy stays legible. Severity runs on a five-level scale.",
  },
  {
    title: "Escalation",
    action: "co2_l4",
    shot: { focus: { kind: "organ", id: "lungs" }, distance: 0.8, azimuth: -22, elevation: 10, duration: 2.2, orbit: 38, orbitDuration: 10 },
    minMs: 6500,
    simple:
      "Carbon dioxide is building up faster than it can be cleared. Red means critical. I raise the alarm, and the numbers always stay easy to read.",
    expert:
      "Inspired CO2 rises and clearance fails, leading to hypercapnia. At level four the interface escalates, while every indicator stays labelled as simulated data.",
  },
  {
    title: "Inside the suit",
    action: "suit_on",
    shot: { focus: { kind: "organ", id: "lungs" }, distance: 1.7, azimuth: 30, elevation: 6, duration: 2.8, orbit: -34, orbitDuration: 12 },
    minMs: 6500,
    simple:
      "Inside the spacesuit, I can see right through it, and the same problem shows up on the suit's own life-support warnings.",
    expert:
      "In the EVA suit, the shell becomes an X-ray overlay, and the scenario drives the suit's life-support telemetry and alert logic.",
  },
  {
    title: "Countermeasure",
    action: "countermeasure",
    shot: { focus: { kind: "organ", id: "lungs" }, distance: 1.3, azimuth: 0, elevation: 4, duration: 2.4 },
    minMs: 5500,
    simple: "The fix is to switch to the backup air cleaner. Watch the body recover, back to calm.",
    expert: "Countermeasure: switch to backup CO2 removal. Severity recovers to baseline without reloading the model.",
  },
  {
    title: "Documented risk",
    action: "clot",
    shot: { focus: { kind: "emergency" }, distance: 0.5, azimuth: -30, elevation: 4, duration: 2.6, orbit: 42, orbitDuration: 12 },
    shotDelay: 450,
    minMs: 7500,
    simple:
      "This next one really happened. On the International Space Station, astronauts were found with slow blood flow, and even a clot, in a vein in the neck. Here you can see the blood backing up behind it.",
    expert:
      "A documented ISS finding: stagnant or reversed internal jugular venous flow in six of eleven crew, and one occlusive thrombus. Flow particles stall behind the obstruction.",
  },
  {
    title: "Your turn",
    action: "finish",
    shot: { focus: { kind: "body" }, distance: 3.6, azimuth: 0, elevation: 4, duration: 3 },
    minMs: 5500,
    simple:
      "Everything you see is clearly marked as simulated, measured, or predicted. Now it's your turn. Tap any organ, or just ask me.",
    expert:
      "Every value is labelled simulated, measured or predicted, and every scenario carries its evidence class. The system is yours: select any structure, or command it by voice or text.",
  },
];

/** Reading-time estimate when narration is off or unavailable. */
export function readMs(text: string): number {
  return Math.round(text.split(/\s+/).length * 330 + 900);
}
