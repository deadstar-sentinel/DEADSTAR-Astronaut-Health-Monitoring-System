import {
  EMERGENCY_BY_ID,
  EMERGENCY_CATEGORY_BY_ID,
  maxLevel,
  type EmergencyCategoryId,
  type SeverityLevel,
} from "../data/emergencyScenarios.ts";
import type { SuitScenarioId } from "./telemetryEngine.ts";

export type EmergencyView = "emergency" | "normal" | "compare";

export interface EmergencyHistoryEntry {
  scenarioId: string;
  startedAt: number;
  peakLevel: SeverityLevel;
}

export interface EmergencyState {
  /** Emergency Simulation mode is open (third interaction mode). */
  modeOpen: boolean;
  categoryId: EmergencyCategoryId;
  /** Scenario previewed in the scenario card. */
  selectedScenarioId: string | null;
  /** Scenario currently simulated on the 3D body. */
  activeScenarioId: string | null;
  /** Timeline stage = severity level of the active scenario. */
  stage: SeverityLevel;
  paused: boolean;
  view: EmergencyView;
  history: EmergencyHistoryEntry[];
  /** Suit telemetry scenario to restore when the emergency ends. */
  suitScenarioBefore: SuitScenarioId | null;
}

export function createInitialEmergencyState(): EmergencyState {
  return {
    modeOpen: false,
    categoryId: "cardiovascular",
    selectedScenarioId: null,
    activeScenarioId: null,
    stage: 0,
    paused: false,
    view: "emergency",
    history: [],
    suitScenarioBefore: null,
  };
}

export function setEmergencyModeOpen(state: EmergencyState, open: boolean): EmergencyState {
  if (open) return { ...state, modeOpen: true };
  // Leaving the mode stops the simulation and restores the normal appearance.
  return { ...stopEmergency(state), modeOpen: false };
}

export function selectEmergencyCategory(state: EmergencyState, categoryId: EmergencyCategoryId): EmergencyState {
  if (!EMERGENCY_CATEGORY_BY_ID[categoryId]) return state;
  return { ...state, categoryId };
}

export function previewScenario(state: EmergencyState, scenarioId: string | null): EmergencyState {
  if (scenarioId && !EMERGENCY_BY_ID[scenarioId]) return state;
  return { ...state, selectedScenarioId: scenarioId };
}

export function activateScenario(
  state: EmergencyState,
  scenarioId: string,
  now: number,
  currentSuitScenario: SuitScenarioId,
): EmergencyState {
  const scenario = EMERGENCY_BY_ID[scenarioId];
  if (!scenario) return state;
  const history = [{ scenarioId, startedAt: now, peakLevel: 1 as SeverityLevel }, ...state.history].slice(0, 8);
  return {
    ...state,
    modeOpen: true,
    categoryId: scenario.category === "eyes" || scenario.category === "neuro" ? state.categoryId : scenario.category,
    selectedScenarioId: scenarioId,
    activeScenarioId: scenarioId,
    stage: 1,
    paused: false,
    view: "emergency",
    history,
    suitScenarioBefore: state.activeScenarioId ? state.suitScenarioBefore : currentSuitScenario,
  };
}

/** Reset to normal: the simulation stops and the anatomy recovers to cyan. */
export function stopEmergency(state: EmergencyState): EmergencyState {
  return { ...state, activeScenarioId: null, stage: 0, paused: false, view: "emergency" };
}

export function setEmergencyStage(state: EmergencyState, stage: number): EmergencyState {
  if (!state.activeScenarioId) return state;
  const scenario = EMERGENCY_BY_ID[state.activeScenarioId];
  const max = maxLevel(scenario);
  const next = Math.max(0, Math.min(max, Math.round(Number.isFinite(stage) ? stage : 0))) as SeverityLevel;
  const history = state.history.map((h, i) =>
    i === 0 && h.scenarioId === state.activeScenarioId && next > h.peakLevel ? { ...h, peakLevel: next } : h,
  );
  return { ...state, stage: next, history };
}

export function stepEmergencyStage(state: EmergencyState, delta: number): EmergencyState {
  return setEmergencyStage(state, state.stage + delta);
}

export function setEmergencyPaused(state: EmergencyState, paused: boolean): EmergencyState {
  return { ...state, paused };
}

export function setEmergencyView(state: EmergencyState, view: EmergencyView): EmergencyState {
  return { ...state, view };
}

/** Auto-advance one stage while running; stops at the scenario's last stage. */
export function advanceTimeline(state: EmergencyState): EmergencyState {
  if (!state.activeScenarioId || state.paused) return state;
  const max = maxLevel(EMERGENCY_BY_ID[state.activeScenarioId]);
  if (state.stage >= max) return state;
  return setEmergencyStage(state, state.stage + 1);
}

export function timelineFinished(state: EmergencyState): boolean {
  if (!state.activeScenarioId) return true;
  return state.stage >= maxLevel(EMERGENCY_BY_ID[state.activeScenarioId]);
}

/** Severity shown on the body right now (Normal view shows healthy anatomy). */
export function displayedLevel(state: EmergencyState): SeverityLevel {
  if (!state.activeScenarioId || state.view === "normal") return 0;
  return state.stage;
}
