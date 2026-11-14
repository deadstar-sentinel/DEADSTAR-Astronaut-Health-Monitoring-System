import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  THERMAL_DISCLOSURE,
  THERMAL_STOPS,
  clampIntensity,
  getThermalGradientCss,
  sampleThermalColor,
} from "./thermalPalette.ts";

describe("thermalPalette", () => {
  it("clamps thermal intensity safely inside [0.2, 1.8]", () => {
    assert.equal(clampIntensity(-5), 0.2);
    assert.equal(clampIntensity(0.2), 0.2);
    assert.equal(clampIntensity(1.15), 1.15);
    assert.equal(clampIntensity(99), 1.8);
    assert.equal(clampIntensity(Number.NaN), 1.0);
  });

  it("samples cool navy/blue at low values and warm orange/yellow at high values", () => {
    const cool = sampleThermalColor(0.0, 1.0);
    assert.equal(cool.hex, "#061426");

    const hotspot = sampleThermalColor(1.0, 1.8);
    assert.equal(hotspot.hex, "#ffd45c");

    const mid = sampleThermalColor(0.45, 1.0);
    assert.ok(mid.b > 0.5 && mid.g > 0.4, "mid gradient should sit in cyan-violet range");
  });

  it("builds a smooth CSS linear-gradient matching all stops", () => {
    const css = getThermalGradientCss();
    assert.ok(css.startsWith("linear-gradient(90deg,"));
    for (const stop of THERMAL_STOPS) {
      assert.ok(css.includes(stop.hex));
    }
  });

  it("includes explicit non-diagnostic disclosure text", () => {
    assert.match(THERMAL_DISCLOSURE, /not measured patient temperatures/i);
  });
});
