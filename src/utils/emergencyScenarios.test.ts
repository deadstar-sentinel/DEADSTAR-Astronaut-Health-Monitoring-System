import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMERGENCY_BY_ID,
  EMERGENCY_CATEGORIES,
  EMERGENCY_SCENARIOS,
  answerLocally,
  categoryForOrgan,
  explanationSections,
  indicatorValue,
  maxLevel,
  severityHex,
} from "../data/emergencyScenarios.ts";
import { ANATOMY_CATALOG } from "../data/anatomyCatalog.ts";

describe("emergency scenario library", () => {
  it("has unique ids and every category lists real scenarios", () => {
    assert.equal(new Set(EMERGENCY_SCENARIOS.map((s) => s.id)).size, EMERGENCY_SCENARIOS.length);
    for (const c of EMERGENCY_CATEGORIES) {
      assert.ok(c.scenarioIds.length > 0, `${c.id} has scenarios`);
      for (const id of c.scenarioIds) assert.ok(EMERGENCY_BY_ID[id], `${c.id} -> ${id} exists`);
    }
  });

  it("covers every requested category with the requested scenario counts", () => {
    const count = (id: string) => EMERGENCY_CATEGORIES.find((c) => c.id === id)?.scenarioIds.length;
    assert.equal(count("cardiovascular"), 8);
    assert.equal(count("neuro"), 6);
    assert.equal(count("respiratory"), 6);
    assert.equal(count("muscular"), 5);
    assert.equal(count("skeletal"), 5);
    assert.equal(count("eyes"), 4);
    assert.equal(count("renal"), 5);
    assert.equal(count("immune"), 4);
  });

  it("every scenario is complete: stages, indicators, targets and all eight explanations", () => {
    for (const s of EMERGENCY_SCENARIOS) {
      assert.ok(s.stages.length >= 4 && s.stages.length <= 5, `${s.id} stages`);
      assert.ok(maxLevel(s) >= 3, `${s.id} reaches at least severe`);
      assert.ok(s.indicators.length > 0, `${s.id} indicators`);
      for (const ind of s.indicators) {
        assert.equal(ind.values.length, 5, `${s.id}/${ind.label} has a value per level`);
        for (const v of ind.values) assert.ok(Number.isFinite(v));
      }
      assert.ok(s.fx.targets.length > 0, `${s.id} highlights something`);
      const sections = explanationSections(s);
      assert.equal(sections.length, 8);
      sections.forEach((sec, i) => {
        // Section 2 is the list of affected structures, which can legitimately be short.
        const min = i === 1 ? 6 : 20;
        assert.ok(sec.a.trim().length > min, `${s.id}: "${sec.q}" answered`);
      });
      assert.ok(s.response.length > 20);
    }
  });

  it("does not claim microgravity causes general emergencies", () => {
    for (const s of EMERGENCY_SCENARIOS.filter((x) => x.evidence === "general")) {
      assert.match(`${s.relevance} ${s.environment}`, /not|general/i, `${s.id} is framed as a general emergency`);
    }
    assert.match(EMERGENCY_BY_ID.altered_venous_flow.environment, /not simply/i);
  });

  it("every clickable organ opens an emergency directory", () => {
    for (const organ of ANATOMY_CATALOG) {
      assert.ok(categoryForOrgan(organ.id), `${organ.id} maps to a category`);
    }
    assert.equal(categoryForOrgan("brain", "ORG_eye_L"), "eyes");
    assert.equal(categoryForOrgan("circulatory", "PROC_vein_jugular_1"), "cardiovascular");
  });

  it("interpolates indicators and colours across the severity scale", () => {
    const ind = EMERGENCY_BY_ID.hypoxia.indicators[0];
    assert.equal(indicatorValue(ind, 0), ind.values[0]);
    assert.equal(indicatorValue(ind, 4), ind.values[4]);
    assert.equal(indicatorValue(ind, 1.5), (ind.values[1] + ind.values[2]) / 2);
    assert.equal(severityHex(0), "#00e5ff");
    assert.equal(severityHex(1), "#ffd45c");
    assert.equal(severityHex(2), "#ff8c42");
    assert.equal(severityHex(3), "#ff3158");
    assert.equal(severityHex(9), "#ff3158");
  });

  it("routes free-text questions to the matching knowledge-base answer", () => {
    const s = EMERGENCY_BY_ID.venous_thrombosis;
    assert.equal(answerLocally(s, "How does microgravity contribute?").a, s.environment);
    assert.equal(answerLocally(s, "What can be monitored?").a, s.monitoring);
    assert.equal(answerLocally(s, "How would the crew treat it?").a, s.response);
    assert.equal(answerLocally(s, "Is this established evidence?").a, s.evidenceNote);
  });
});
