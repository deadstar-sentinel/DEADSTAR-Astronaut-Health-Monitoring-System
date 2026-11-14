import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTelemetrySnapshot, generate48HourForecast } from "./telemetryEngine.ts";

describe("telemetryEngine", () => {
  it("reports nominal EVA metrics cleanly with zero active alerts", () => {
    const snap = buildTelemetrySnapshot("nominal", 0);
    assert.equal(snap.isSimulated, true);
    assert.equal(snap.overallStatus, "normal");
    assert.equal(snap.alerts.length, 0);
    assert.equal(snap.vitals.heartRateBpm.status, "normal");
    assert.equal(snap.lifeSupport.suitPressureKpa.status, "normal");
    assert.equal(snap.power.batteryPct.status, "normal");
  });

  it("flags critical alerts accurately during fault scenarios", () => {
    const o2Snap = buildTelemetrySnapshot("o2_leak", 0);
    assert.equal(o2Snap.overallStatus, "critical");
    assert.ok(o2Snap.alerts.some((a) => a.severity === "critical" && a.id === "alert-o2-pressure"));

    const co2Snap = buildTelemetrySnapshot("co2_saturation", 0);
    assert.equal(co2Snap.overallStatus, "critical");
    assert.ok(co2Snap.alerts.some((a) => a.severity === "critical" && a.id === "alert-co2-saturation"));

    const thermalSnap = buildTelemetrySnapshot("thermal_spike", 0);
    assert.equal(thermalSnap.overallStatus, "critical");
    assert.ok(thermalSnap.alerts.some((a) => a.severity === "critical" && a.id === "alert-thermal-cooling"));

    const pwrSnap = buildTelemetrySnapshot("low_power", 0);
    assert.equal(pwrSnap.overallStatus, "critical");
    assert.ok(pwrSnap.alerts.some((a) => a.severity === "critical" && a.id === "alert-power-comm"));

    const radSnap = buildTelemetrySnapshot("radiation_storm", 0);
    assert.equal(radSnap.overallStatus, "critical");
    assert.ok(radSnap.alerts.some((a) => a.severity === "critical" && a.id === "alert-radiation-spe"));
  });

  it("generates monotonic 48h predictive horizons with explicit depletion warnings", () => {
    const snap = buildTelemetrySnapshot("nominal", 0);
    const forecast = generate48HourForecast(snap);
    assert.equal(forecast.isSimulated, true);
    assert.deepEqual(
      forecast.points.map((p) => p.horizonHours),
      [0, 6, 12, 24, 48],
    );
    assert.ok(forecast.points[0].remainingO2Pct > forecast.points[1].remainingO2Pct);
    assert.ok(forecast.o2DepletionHours !== null && forecast.o2DepletionHours < 48);
    assert.ok(forecast.assumptions.length >= 2);
  });
});
