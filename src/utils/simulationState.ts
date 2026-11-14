import {
  ANATOMY_BY_ID,
  ANATOMY_CATALOG,
  type AnatomyId,
  type AnimationMode,
  type BodySystemId,
  type CameraPresetId,
  type VisualizationMode,
} from "../data/anatomyCatalog.ts";
import { clampIntensity } from "./thermalPalette.ts";

export interface DisplaySettings {
  showLabels: boolean;
  showParticles: boolean;
  showScanLines: boolean;
  showSkinShell: boolean;
}

export interface SimulationState {
  mode: VisualizationMode;
  systemFilter: BodySystemId;
  selectedOrganId: AnatomyId | null;
  isolated: boolean;
  cameraPreset: CameraPresetId;
  visualizationIntensity: number;
  thermalIntensity: number;
  animationMode: AnimationMode;
  display: DisplaySettings;
}

export function createInitialSimulationState(): SimulationState {
  return {
    mode: "holographic",
    systemFilter: "all",
    selectedOrganId: null,
    isolated: false,
    cameraPreset: "reset",
    visualizationIntensity: 1.0,
    thermalIntensity: 1.0,
    animationMode: "playing",
    display: {
      showLabels: true,
      showParticles: true,
      showScanLines: true,
      showSkinShell: true,
    },
  };
}

export function selectOrgan(state: SimulationState, organId: AnatomyId | null): SimulationState {
  if (!organId) {
    return {
      ...state,
      selectedOrganId: null,
      isolated: false,
    };
  }
  return {
    ...state,
    selectedOrganId: organId,
  };
}

export function toggleIsolateOrgan(state: SimulationState): SimulationState {
  if (!state.selectedOrganId) {
    return { ...state, isolated: false };
  }
  return {
    ...state,
    isolated: !state.isolated,
  };
}

export function restoreCompleteBody(state: SimulationState): SimulationState {
  return {
    ...state,
    isolated: false,
  };
}

export function setVisualizationMode(
  state: SimulationState,
  mode: VisualizationMode,
): SimulationState {
  return {
    ...state,
    mode,
  };
}

export function setBodySystemFilter(
  state: SimulationState,
  systemFilter: BodySystemId,
): SimulationState {
  return {
    ...state,
    systemFilter,
  };
}

export function setThermalIntensity(state: SimulationState, value: number): SimulationState {
  return {
    ...state,
    thermalIntensity: clampIntensity(value, 0.2, 1.8),
  };
}

export function setVisualizationIntensity(state: SimulationState, value: number): SimulationState {
  return {
    ...state,
    visualizationIntensity: clampIntensity(value, 0.2, 1.8),
  };
}

export function setAnimationMode(
  state: SimulationState,
  animationMode: AnimationMode,
): SimulationState {
  return {
    ...state,
    animationMode,
  };
}

export function getFilteredStructures(systemFilter: BodySystemId) {
  if (systemFilter === "all") return ANATOMY_CATALOG;
  return ANATOMY_CATALOG.filter((item) => item.system === systemFilter);
}

export function isStructureDimmed(state: SimulationState, organId: AnatomyId): boolean {
  if (!state.selectedOrganId) return false;
  return state.selectedOrganId !== organId;
}

export function isStructureHiddenByIsolation(state: SimulationState, organId: AnatomyId): boolean {
  if (!state.isolated || !state.selectedOrganId) return false;
  if (state.selectedOrganId === organId) return false;

  // Composite system selections keep their constituent organs visible when isolated
  if (state.selectedOrganId === "nervous" && organId === "brain") return false;
  if (state.selectedOrganId === "circulatory" && organId === "heart") return false;
  if (state.selectedOrganId === "skeletal" && organId === "spine") return false;

  return true;
}

export function getSelectedStructure(state: SimulationState) {
  if (!state.selectedOrganId) return null;
  return ANATOMY_BY_ID[state.selectedOrganId] ?? null;
}
