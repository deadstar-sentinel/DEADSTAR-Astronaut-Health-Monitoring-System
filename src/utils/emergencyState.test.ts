import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activateScenario,
  advanceTimeline,
  createInitialEmergencyState,
  displayedLevel,
  previewScenario,
  selectEmergencyCategory,
  setEmergencyModeOpen,
  setEmergencyPaused,
  setEmergencyStage,
  setEmergencyView,
  stepEmergencyStage,
  stopEmergency,
  timelineFinished,
} from "./emergencyState.ts";
import { EMERGENCY_BY_ID, maxLevel } from "../data/emergencyScenarios.ts";

const NOW = 1_700_000_000_000;

describe("emergencyState", () => {
  it("starts closed, idle and at normal severity", () => {
    const s = createInitialEmergencyState();
    assert.equal(s.modeOpen, false);
    assert.equal(s.activeScenarioId, null);
    assert.equal(displayedLevel(s), 0);
  });

  it("previews without changing the body, then activates at stage 1", () => {
    let s = setEmergencyModeOpen(createInitialEmergencyState(), true);
    s = previewScenario(s, "venous_thrombosis");
    assert.equal(s.selectedScenarioId, "venous_thrombosis");
    assert.equal(displayedLevel(s), 0, "a preview never shows severity");
    s = activateScenario(s, "venous_thrombosis", NOW, "nominal");
    assert.equal(s.activeScenarioId, "venous_thrombosis");
    assert.equal(s.stage, 1);
    assert.equal(displayedLevel(s), 1);
    assert.equal(s.history.length, 1);
    assert.equal(s.suitScenarioBefore, "nominal");
  });

  it("ignores unknown scenarios and categories", () => {
    const s = createInitialEmergencyState();
    assert.equal(previewScenario(s, "nope"), s);
    assert.equal(activateScenario(s, "nope", NOW, "nominal"), s);
    // @ts-expect-error invalid category id on purpose
    assert.equal(selectEmergencyCategory(s, "spleen"), s);
  });

  it("clamps stages to the scenario's own scale and records the peak", () => {
    let s = activateScenario(createInitialEmergencyState(), "muscle_atrophy", NOW, "nominal");
    const max = maxLevel(EMERGENCY_BY_ID.muscle_atrophy);
    s = setEmergencyStage(s, 99);
    assert.equal(s.stage, max);
    assert.equal(s.history[0].peakLevel, max);
    s = stepEmergencyStage(s, -10);
    assert.equal(s.stage, 0);
    assert.equal(s.history[0].peakLevel, max, "peak is kept after stepping down");
    s = setEmergencyStage(s, Number.NaN);
    assert.equal(s.stage, 0);
  });

  it("auto-advances until the final stage and respects pause", () => {
    let s = activateScenario(createInitialEmergencyState(), "venous_thrombosis", NOW, "nominal");
    const paused = advanceTimeline(setEmergencyPaused(s, true));
    assert.equal(paused.stage, 1);
    for (let i = 0; i < 10; i++) s = advanceTimeline(s);
    assert.equal(s.stage, 4);
    assert.ok(timelineFinished(s));
  });

  it("Normal view shows healthy anatomy while the scenario keeps its stage", () => {
    let s = activateScenario(createInitialEmergencyState(), "hypoxia", NOW, "nominal");
    s = setEmergencyStage(s, 3);
    s = setEmergencyView(s, "normal");
    assert.equal(displayedLevel(s), 0);
    assert.equal(s.stage, 3);
    s = setEmergencyView(s, "emergency");
    assert.equal(displayedLevel(s), 3);
  });

  it("reset and leaving the mode always return to normal", () => {
    let s = activateScenario(setEmergencyModeOpen(createInitialEmergencyState(), true), "sans", NOW, "o2_leak");
    s = setEmergencyStage(s, 3);
    const reset = stopEmergency(s);
    assert.equal(reset.activeScenarioId, null);
    assert.equal(displayedLevel(reset), 0);
    assert.equal(reset.modeOpen, true, "reset keeps the mode open");
    const closed = setEmergencyModeOpen(s, false);
    assert.equal(closed.modeOpen, false);
    assert.equal(closed.activeScenarioId, null);
  });

  it("keeps the original suit scenario when switching between emergencies", () => {
    let s = activateScenario(createInitialEmergencyState(), "hypercapnia", NOW, "nominal");
    s = activateScenario(s, "hypoxia", NOW + 1, "co2_saturation");
    assert.equal(s.suitScenarioBefore, "nominal");
  });
});
