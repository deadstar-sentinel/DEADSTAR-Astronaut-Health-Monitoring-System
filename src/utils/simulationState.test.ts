import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ANATOMY_CATALOG, VISUALIZATION_MODES } from "../data/anatomyCatalog.ts";
import { SPACESUIT_CATALOG } from "../data/spacesuitCatalog.ts";
import {
  createInitialSimulationState,
  getFilteredStructures,
  getFilteredSuitComponents,
  getSelectedStructure,
  getSelectedSuitComponent,
  isStructureDimmed,
  isStructureHiddenByIsolation,
  isSuitComponentDimmed,
  isSuitComponentHiddenByIsolation,
  restoreCompleteBody,
  selectOrgan,
  selectSuitComponent,
  setAnimationMode,
  setBodySystemFilter,
  setExplodeProgress,
  setThermalIntensity,
  setVisualizationIntensity,
  setVisualizationMode,
  toggleIsolateOrgan,
  toggleSuitMode,
} from "./simulationState.ts";

describe("simulationState", () => {
  it("contains all 14 required anatomical structures, 9 visualization modes, and 22 spacesuit components", () => {
    assert.equal(ANATOMY_CATALOG.length, 14);
    assert.equal(VISUALIZATION_MODES.length, 9);
    assert.equal(SPACESUIT_CATALOG.length, 22);

    const requiredNames = [
      "Brain",
      "Heart",
      "Lungs",
      "Liver",
      "Kidneys",
      "Stomach",
      "Pancreas",
      "Small intestine",
      "Large intestine",
      "Spine",
      "Skeletal system",
      "Muscular system",
      "Nervous system",
      "Circulatory system",
    ];
    for (const name of requiredNames) {
      assert.ok(
        ANATOMY_CATALOG.some((s) => s.name === name),
        `Missing required structure: ${name}`,
      );
    }

    const requiredSuitNames = [
      "Helmet Assembly",
      "Helmet Visor",
      "Communication System",
      "Chest Display",
      "Primary Life Support System",
      "Oxygen Supply",
      "CO2 Removal System",
      "Cooling System",
      "Pressure Regulation",
      "Electrical Power",
      "Shoulder Joints",
      "Elbow Joints",
      "Wrist Bearings",
      "Gloves",
      "Waist Assembly",
      "Hip Joints",
      "Knee Joints",
      "Leg Assemblies",
      "Boots",
      "Thermal Protection Layers",
      "Pressure Bladder",
      "Emergency Oxygen System",
    ];
    for (const name of requiredSuitNames) {
      assert.ok(
        SPACESUIT_CATALOG.some((s) => s.name === name),
        `Missing required suit component: ${name}`,
      );
    }
  });

  it("handles selection, dimming, isolation, and complete body restoration", () => {
    let state = createInitialSimulationState();
    assert.equal(state.selectedOrganId, null);
    assert.equal(isStructureDimmed(state, "heart"), false);

    state = toggleIsolateOrgan(state);
    assert.equal(state.isolated, false);

    state = selectOrgan(state, "heart");
    assert.equal(getSelectedStructure(state)?.name, "Heart");
    assert.equal(isStructureDimmed(state, "heart"), false);
    assert.equal(isStructureDimmed(state, "brain"), true);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), false);

    state = toggleIsolateOrgan(state);
    assert.equal(state.isolated, true);
    assert.equal(isStructureHiddenByIsolation(state, "heart"), false);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), true);

    state = restoreCompleteBody(state);
    assert.equal(state.isolated, false);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), false);
    assert.equal(state.selectedOrganId, "heart");

    state = toggleIsolateOrgan(state);
    state = selectOrgan(state, null);
    assert.equal(state.isolated, false);
    assert.equal(state.selectedOrganId, null);
  });

  it("keeps constituent organs visible when composite systems are isolated", () => {
    let state = createInitialSimulationState();
    state = selectOrgan(state, "nervous");
    state = toggleIsolateOrgan(state);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), false);
    assert.equal(isStructureHiddenByIsolation(state, "liver"), true);

    state = selectOrgan(state, "circulatory");
    assert.equal(isStructureHiddenByIsolation(state, "heart"), false);
    assert.equal(isStructureHiddenByIsolation(state, "lungs"), true);

    state = selectOrgan(state, "skeletal");
    assert.equal(isStructureHiddenByIsolation(state, "spine"), false);
    assert.equal(isStructureHiddenByIsolation(state, "stomach"), true);
  });

  it("handles Astronaut Spacesuit transformation, exploded view, and component isolation", () => {
    let state = createInitialSimulationState();
    state = setBodySystemFilter(state, "digestive");
    assert.equal(state.suitActive, false);

    // Activate suit while keeping intensities and camera preset
    state = setThermalIntensity(state, 1.35);
    state = toggleSuitMode(state, true);
    assert.equal(state.suitActive, true);
    assert.equal(state.thermalIntensity, 1.35);

    // Explode slider clamping
    state = setExplodeProgress(state, 1.4);
    assert.equal(state.explodeProgress, 1.0);

    // Select PLSS and isolate -> keeps internal O2/CO2/cooling visible
    state = selectSuitComponent(state, "plss");
    assert.equal(getSelectedSuitComponent(state)?.name, "Primary Life Support System");
    assert.equal(isSuitComponentDimmed(state, "boots"), true);
    state = toggleIsolateOrgan(state);
    assert.equal(isSuitComponentHiddenByIsolation(state, "oxygen_supply"), false);
    assert.equal(isSuitComponentHiddenByIsolation(state, "boots"), true);

    // Restore resets explodeProgress & isolation
    state = restoreCompleteBody(state);
    assert.equal(state.explodeProgress, 0);
    assert.equal(state.isolated, false);

    // Switching back from Engineering Mode falls back cleanly to Holographic while preserving human anatomy
    state = setVisualizationMode(state, "engineering");
    assert.equal(state.suitActive, true);
    state = toggleSuitMode(state, false);
    assert.equal(state.suitActive, false);
    assert.equal(state.mode, "holographic");
  });

  it("filters directories and updates modes/intensities safely", () => {
    let state = createInitialSimulationState();
    state = setBodySystemFilter(state, "digestive");
    const digestive = getFilteredStructures(state.systemFilter);
    assert.deepEqual(
      digestive.map((d) => d.id),
      ["liver", "stomach", "pancreas", "small_intestine", "large_intestine"],
    );

    const lss = getFilteredSuitComponents("life_support");
    assert.equal(lss.length, 6);

    state = setVisualizationMode(state, "thermal");
    assert.equal(state.mode, "thermal");

    state = setThermalIntensity(state, 5.0);
    assert.equal(state.thermalIntensity, 1.8);

    state = setVisualizationIntensity(state, -1);
    assert.equal(state.visualizationIntensity, 0.2);

    state = setAnimationMode(state, "disabled");
    assert.equal(state.animationMode, "disabled");
  });
});
