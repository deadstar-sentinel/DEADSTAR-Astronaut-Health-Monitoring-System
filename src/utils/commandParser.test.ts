import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "./commandParser.ts";

describe("console command parser", () => {
  it("parses terse commands", () => {
    assert.deepEqual(parseCommand("SCAN HEART"), { kind: "scan", organ: "heart" });
    assert.deepEqual(parseCommand("isolate kidneys"), { kind: "isolate", organ: "kidneys" });
    assert.deepEqual(parseCommand("SIMULATE HYPOXIA --severity=3"), { kind: "simulate", scenarioId: "hypoxia", severity: 3 });
    assert.deepEqual(parseCommand("simulate clot"), { kind: "simulate", scenarioId: "venous_thrombosis", severity: null });
    assert.deepEqual(parseCommand("SIMULATE SCRUBBER FAILURE"), { kind: "simulate", scenarioId: "co2_scrubber_failure", severity: null });
    assert.deepEqual(parseCommand("severity 4"), { kind: "severity", level: 4 });
    assert.deepEqual(parseCommand("up"), { kind: "step", delta: 1 });
    assert.deepEqual(parseCommand("VIEW COMPARE"), { kind: "view", view: "compare" });
    assert.deepEqual(parseCommand("suit off"), { kind: "suit", on: false });
    assert.deepEqual(parseCommand("mode x-ray"), { kind: "mode", mode: "xray" });
    assert.equal(parseCommand("reset").kind, "reset");
    assert.equal(parseCommand("help").kind, "help");
    assert.equal(parseCommand("demo").kind, "demo");
  });

  it("understands plain-English requests, preferring scenarios over organ names", () => {
    assert.deepEqual(parseCommand("show me a blood clot"), { kind: "simulate", scenarioId: "venous_thrombosis", severity: null });
    assert.equal((parseCommand("what happens to bones in space") as { scenarioId: string }).scenarioId, "bone_loss");
    assert.equal((parseCommand("heart attack") as { scenarioId: string }).scenarioId, "myocardial_infarction");
    assert.equal((parseCommand("co2 is too high") as { scenarioId: string }).scenarioId, "hypercapnia");
    assert.deepEqual(parseCommand("look at the lungs"), { kind: "scan", organ: "lungs" });
  });

  it("reports unknown input without throwing", () => {
    const a = parseCommand("make me a sandwich");
    assert.equal(a.kind, "unknown");
    assert.equal(parseCommand("   ").kind, "unknown");
  });
});
