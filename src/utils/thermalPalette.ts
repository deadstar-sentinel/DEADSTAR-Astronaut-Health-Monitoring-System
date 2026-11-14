export interface ThermalStop {
  stop: number;
  hex: string;
  rgb: [number, number, number];
  label: string;
}

export const THERMAL_STOPS: ThermalStop[] = [
  { stop: 0.0, hex: "#061426", rgb: [6, 20, 38], label: "Coolest Base" },
  { stop: 0.18, hex: "#008CFF", rgb: [0, 140, 255], label: "Cool" },
  { stop: 0.36, hex: "#00E5FF", rgb: [0, 229, 255], label: "Intermediate" },
  { stop: 0.54, hex: "#8A5CFF", rgb: [138, 92, 255], label: "Transition" },
  { stop: 0.72, hex: "#FF3DAD", rgb: [255, 61, 173], label: "Elevated" },
  { stop: 0.86, hex: "#FF3158", rgb: [255, 49, 88], label: "Warm" },
  { stop: 0.94, hex: "#FF8C42", rgb: [255, 140, 66], label: "Hotspot" },
  { stop: 1.0, hex: "#FFD45C", rgb: [255, 212, 92], label: "Peak Focus" },
];

export const THERMAL_DISCLOSURE =
  "Thermal colors represent a relative shader visualization layer for structural contrast—not measured patient temperatures.";

export function clampIntensity(value: number, min = 0.2, max = 1.8): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.min(max, Math.max(min, value));
}

export function sampleThermalColor(
  normalizedValue: number,
  intensity = 1.0,
): { r: number; g: number; b: number; hex: string } {
  const clampedIntensity = clampIntensity(intensity);
  const t = Math.min(1, Math.max(0, normalizedValue * (0.55 + clampedIntensity * 0.45)));

  let lower = THERMAL_STOPS[0];
  let upper = THERMAL_STOPS[THERMAL_STOPS.length - 1];

  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const a = THERMAL_STOPS[i];
    const b = THERMAL_STOPS[i + 1];
    if (t >= a.stop && t <= b.stop) {
      lower = a;
      upper = b;
      break;
    }
  }

  const span = upper.stop - lower.stop || 1;
  const alpha = Math.min(1, Math.max(0, (t - lower.stop) / span));

  const r = Math.round(lower.rgb[0] + (upper.rgb[0] - lower.rgb[0]) * alpha);
  const g = Math.round(lower.rgb[1] + (upper.rgb[1] - lower.rgb[1]) * alpha);
  const b = Math.round(lower.rgb[2] + (upper.rgb[2] - lower.rgb[2]) * alpha);

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return {
    r: r / 255,
    g: g / 255,
    b: b / 255,
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
  };
}

export function getThermalGradientCss(): string {
  const stops = THERMAL_STOPS.map((s) => `${s.hex} ${Math.round(s.stop * 100)}%`).join(", ");
  return `linear-gradient(90deg, ${stops})`;
}
