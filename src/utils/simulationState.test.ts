import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ANATOMY_CATALOG, VISUALIZATION_MODES } from "../data/anatomyCatalog.ts";
import {
  createInitialSimulationState,
  getFilteredStructures,
  getSelectedStructure,
  isStructureDimmed,
  isStructureHiddenByIsolation,
  restoreCompleteBody,
  selectOrgan,
  setAnimationMode,
  setBodySystemFilter,
  setThermalIntensity,
  setVisualizationIntensity,
  setVisualizationMode,
  toggleIsolateOrgan,
} from "./simulationState.ts";

describe("simulationState", () => {
  it("contains all 14 required anatomical structures and 7 visualization modes", () => {
    assert.equal(ANATOMY_CATALOG.length, 14);
    assert.equal(VISUALIZATION_MODES.length, 7);

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
  });

  it("handles selection, dimming, isolation, and complete body restoration", () => {
    let state = createInitialSimulationState();
    assert.equal(state.selectedOrganId, null);
    assert.equal(isStructureDimmed(state, "heart"), false);

    // Cannot isolate without an organ selected
    state = toggleIsolateOrgan(state);
    assert.equal(state.isolated, false);

    // Select heart -> other structures dim, not hidden until isolated
    state = selectOrgan(state, "heart");
    assert.equal(getSelectedStructure(state)?.name, "Heart");
    assert.equal(isStructureDimmed(state, "heart"), false);
    assert.equal(isStructureDimmed(state, "brain"), true);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), false);

    // Isolate heart -> non-heart structures hidden
    state = toggleIsolateOrgan(state);
    assert.equal(state.isolated, true);
    assert.equal(isStructureHiddenByIsolation(state, "heart"), false);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), true);

    // Restore complete body -> isolated resets while keeping selection available
    state = restoreCompleteBody(state);
    assert.equal(state.isolated, false);
    assert.equal(isStructureHiddenByIsolation(state, "brain"), false);
    assert.equal(state.selectedOrganId, "heart");

    // Clear selection clears isolation too
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

  it("filters directory by body system and updates modes/intensities safely", () => {
    let state = createInitialSimulationState();
    state = setBodySystemFilter(state, "digestive");
    const digestive = getFilteredStructures(state.systemFilter);
    assert.deepEqual(
      digestive.map((d) => d.id),
      ["liver", "stomach", "pancreas", "small_intestine", "large_intestine"],
    );

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
