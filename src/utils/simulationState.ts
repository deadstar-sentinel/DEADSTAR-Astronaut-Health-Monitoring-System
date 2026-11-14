import {
  ANATOMY_BY_ID,
  ANATOMY_CATALOG,
  type AnatomyId,
  type AnimationMode,
  type BodySystemId,
  type CameraPresetId,
  type VisualizationMode,
} from "../data/anatomyCatalog.ts";
import {
  SPACESUIT_CATALOG,
  SUIT_COMPONENT_BY_ID,
  type SuitComponentId,
  type SuitSubsystemId,
} from "../data/spacesuitCatalog.ts";
import type { SuitScenarioId } from "./telemetryEngine.ts";
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
  // Astronaut Spacesuit Platform state
  suitActive: boolean;
  explodeProgress: number;
  selectedSuitComponentId: SuitComponentId | null;
  suitSubsystemFilter: SuitSubsystemId;
  suitScenarioId: SuitScenarioId;
  monitoringDashboardOpen: boolean;
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
    suitActive: false,
    explodeProgress: 0,
    selectedSuitComponentId: null,
    suitSubsystemFilter: "all",
    suitScenarioId: "nominal",
    monitoringDashboardOpen: false,
  };
}

export function toggleSuitMode(state: SimulationState, nextActive?: boolean): SimulationState {
  const suitActive = typeof nextActive === "boolean" ? nextActive : !state.suitActive;
  if (!suitActive) {
    // Returning to Normal Human Anatomy preserves camera preset, intensities, animation, and display settings
    const fallbackMode: VisualizationMode =
      state.mode === "engineering" || state.mode === "ai_monitoring" ? "holographic" : state.mode;
    return {
      ...state,
      suitActive: false,
      explodeProgress: 0,
      selectedSuitComponentId: null,
      isolated: state.selectedSuitComponentId ? false : state.isolated,
      monitoringDashboardOpen: false,
      mode: fallbackMode,
    };
  }

  return {
    ...state,
    suitActive: true,
    isolated: state.selectedOrganId ? false : state.isolated,
  };
}

export function setExplodeProgress(state: SimulationState, value: number): SimulationState {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return {
    ...state,
    explodeProgress: Math.round(clamped * 100) / 100,
  };
}

export function selectOrgan(state: SimulationState, organId: AnatomyId | null): SimulationState {
  if (!organId) {
    return {
      ...state,
      selectedOrganId: null,
      isolated: state.selectedSuitComponentId ? state.isolated : false,
    };
  }
  return {
    ...state,
    selectedOrganId: organId,
    selectedSuitComponentId: null,
  };
}

export function selectSuitComponent(
  state: SimulationState,
  componentId: SuitComponentId | null,
): SimulationState {
  if (!componentId) {
    return {
      ...state,
      selectedSuitComponentId: null,
      isolated: state.selectedOrganId ? state.isolated : false,
    };
  }
  return {
    ...state,
    suitActive: true,
    selectedSuitComponentId: componentId,
    selectedOrganId: null,
  };
}

export function toggleIsolateOrgan(state: SimulationState): SimulationState {
  if (!state.selectedOrganId && !state.selectedSuitComponentId) {
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
    explodeProgress: 0,
  };
}

export function setVisualizationMode(
  state: SimulationState,
  mode: VisualizationMode,
): SimulationState {
  const requiresSuit = mode === "engineering" || mode === "ai_monitoring";
  return {
    ...state,
    mode,
    suitActive: requiresSuit ? true : state.suitActive,
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

export function setSuitSubsystemFilter(
  state: SimulationState,
  suitSubsystemFilter: SuitSubsystemId,
): SimulationState {
  return {
    ...state,
    suitSubsystemFilter,
  };
}

export function setSuitScenario(
  state: SimulationState,
  suitScenarioId: SuitScenarioId,
): SimulationState {
  return {
    ...state,
    suitScenarioId,
  };
}

export function setMonitoringDashboardOpen(
  state: SimulationState,
  monitoringDashboardOpen: boolean,
): SimulationState {
  return {
    ...state,
    monitoringDashboardOpen,
    suitActive: monitoringDashboardOpen ? true : state.suitActive,
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

export function getFilteredSuitComponents(subsystemFilter: SuitSubsystemId) {
  if (subsystemFilter === "all") return SPACESUIT_CATALOG;
  return SPACESUIT_CATALOG.filter((item) => item.subsystem === subsystemFilter);
}

export function isStructureDimmed(state: SimulationState, organId: AnatomyId): boolean {
  if (!state.selectedOrganId && !state.selectedSuitComponentId) return false;
  if (state.selectedSuitComponentId) return true;
  return state.selectedOrganId !== organId;
}

export function isStructureHiddenByIsolation(state: SimulationState, organId: AnatomyId): boolean {
  if (!state.isolated) return false;
  if (state.selectedSuitComponentId) return true;
  if (!state.selectedOrganId) return false;
  if (state.selectedOrganId === organId) return false;

  // Composite system selections keep their constituent organs visible when isolated
  if (state.selectedOrganId === "nervous" && organId === "brain") return false;
  if (state.selectedOrganId === "circulatory" && organId === "heart") return false;
  if (state.selectedOrganId === "skeletal" && organId === "spine") return false;

  return true;
}

export function isSuitComponentDimmed(
  state: SimulationState,
  componentId: SuitComponentId,
): boolean {
  if (!state.selectedSuitComponentId) return false;
  return state.selectedSuitComponentId !== componentId;
}

export function isSuitComponentHiddenByIsolation(
  state: SimulationState,
  componentId: SuitComponentId,
): boolean {
  if (!state.isolated) return false;
  if (state.selectedOrganId) return true;
  if (!state.selectedSuitComponentId) return false;
  if (state.selectedSuitComponentId === componentId) return false;

  // Isolating PLSS keeps its internal core subsystems visible for inspection
  if (
    state.selectedSuitComponentId === "plss" &&
    (componentId === "oxygen_supply" ||
      componentId === "co2_removal" ||
      componentId === "cooling_system" ||
      componentId === "pressure_regulation" ||
      componentId === "electrical_power" ||
      componentId === "emergency_oxygen_system")
  ) {
    return false;
  }
  return true;
}

export function getSelectedStructure(state: SimulationState) {
  if (!state.selectedOrganId) return null;
  return ANATOMY_BY_ID[state.selectedOrganId] ?? null;
}

export function getSelectedSuitComponent(state: SimulationState) {
  if (!state.selectedSuitComponentId) return null;
  return SUIT_COMPONENT_BY_ID[state.selectedSuitComponentId] ?? null;
}
