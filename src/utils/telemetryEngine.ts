import type { SuitComponentId } from "../data/spacesuitCatalog.ts";

export type SeverityStatus = "normal" | "warning" | "critical";

export type SuitScenarioId =
  | "nominal"
  | "o2_leak"
  | "co2_saturation"
  | "thermal_spike"
  | "low_power"
  | "radiation_storm";

export interface SuitScenarioMeta {
  id: SuitScenarioId;
  label: string;
  shortLabel: string;
  description: string;
}

export const SUIT_SCENARIOS: SuitScenarioMeta[] = [
  {
    id: "nominal",
    label: "Nominal EVA Traverse",
    shortLabel: "Nominal",
    description: "All life-support loops, pressure seals, vitals, and power reserves operating within nominal margins.",
  },
  {
    id: "o2_leak",
    label: "O2 Pressure Drop / Suit Leak",
    shortLabel: "O2 Leak",
    description: "Simulated micrometeoroid micro-breach increasing suit leak rate and dropping O2 supply pressure.",
  },
  {
    id: "co2_saturation",
    label: "CO2 Scrubber Saturation",
    shortLabel: "CO2 High",
    description: "Simulated amine scrubber bed saturation causing suit partial CO2 and astronaut respiratory elevation.",
  },
  {
    id: "thermal_spike",
    label: "Cooling Loop Thermal Spike",
    shortLabel: "Thermal",
    description: "Simulated LCVG sublimator degradation causing suit thermal rise and cardiovascular heat strain.",
  },
  {
    id: "low_power",
    label: "Low Battery / Comm Degradation",
    shortLabel: "Low Power",
    description: "Simulated primary battery depletion with reduced RF link margin during shadowed terrain operations.",
  },
  {
    id: "radiation_storm",
    label: "Solar Particle Radiation Alert",
    shortLabel: "Radiation",
    description: "Simulated elevated Solar Particle Event (SPE) ionizing radiation flux requiring shelter protocol.",
  },
];

export interface MetricWithStatus<T = number> {
  value: T;
  status: SeverityStatus;
}

export interface SuitAlert {
  id: string;
  severity: "warning" | "critical";
  title: string;
  componentId: SuitComponentId;
  componentName: string;
  sensorReading: string;
  reason: string;
  recommendedAction: string;
  timestamp: string;
}

export interface SuitTelemetrySnapshot {
  isSimulated: true;
  disclosure: string;
  scenarioId: SuitScenarioId;
  overallStatus: SeverityStatus;
  vitals: {
    heartRateBpm: MetricWithStatus;
    spo2Pct: MetricWithStatus;
    coreTempC: MetricWithStatus;
    skinTempC: MetricWithStatus;
    respiratoryRateBpm: MetricWithStatus;
    physicalCondition: MetricWithStatus<string>;
    stressLevel: MetricWithStatus<string>;
  };
  lifeSupport: {
    o2TankPressureKpa: MetricWithStatus;
    o2TankPressurePsi: number;
    remainingO2Pct: MetricWithStatus;
    o2ConsumptionLpm: number;
    co2MmHg: MetricWithStatus;
    co2ScrubberStatus: MetricWithStatus<string>;
    scrubberRemainingPct: MetricWithStatus;
    scrubberEstHours: number;
    ventilationLpm: MetricWithStatus;
    suitPressureKpa: MetricWithStatus;
    leakRateKpaPerMin: MetricWithStatus;
    coolingPerformancePct: MetricWithStatus;
    humidityPct: MetricWithStatus;
  };
  environment: {
    externalTempC: MetricWithStatus;
    suitInternalTempC: MetricWithStatus;
    radiationMSvPerHr: MetricWithStatus;
    ambientPressureKpa: number;
    externalO2Pct: number;
    commSignalStrengthPct: MetricWithStatus;
    commSignalDbm: number;
  };
  power: {
    batteryPct: MetricWithStatus;
    estOperatingHours: number;
    electricalStatus: MetricWithStatus<string>;
    lifeSupportStatus: MetricWithStatus<string>;
    sensorNetworkStatus: MetricWithStatus<string>;
    commLinkStatus: MetricWithStatus<string>;
  };
  alerts: SuitAlert[];
}

export interface ForecastHorizonPoint {
  horizonHours: 0 | 6 | 12 | 24 | 48;
  label: string;
  remainingO2Pct: number;
  scrubberRemainingPct: number;
  batteryPct: number;
  coolingPerformancePct: number;
  systemHealthScore: number;
  riskBand: SeverityStatus;
  maintenanceNote: string;
}

export interface Suit48HourForecast {
  isSimulated: true;
  scenarioId: SuitScenarioId;
  points: ForecastHorizonPoint[];
  o2DepletionHours: number | null;
  co2SaturationHours: number | null;
  batteryDepletionHours: number | null;
  warnings: string[];
  assumptions: string[];
}

interface ScenarioBaseline {
  hr: number;
  spo2: number;
  coreTemp: number;
  skinTemp: number;
  resp: number;
  o2Kpa: number;
  o2Pct: number;
  o2Draw: number;
  co2: number;
  scrubberPct: number;
  ventLpm: number;
  suitKpa: number;
  leakRate: number;
  coolingPct: number;
  humidityPct: number;
  extTemp: number;
  suitTemp: number;
  radMSv: number;
  commPct: number;
  batteryPct: number;
}

const SCENARIO_BASELINES: Record<SuitScenarioId, ScenarioBaseline> = {
  nominal: {
    hr: 76,
    spo2: 98.4,
    coreTemp: 37.0,
    skinTemp: 33.4,
    resp: 15,
    o2Kpa: 18400,
    o2Pct: 86,
    o2Draw: 0.92,
    co2: 1.4,
    scrubberPct: 88,
    ventLpm: 170,
    suitKpa: 29.6,
    leakRate: 0.008,
    coolingPct: 96,
    humidityPct: 44,
    extTemp: -112,
    suitTemp: 21.8,
    radMSv: 0.08,
    commPct: 94,
    batteryPct: 84,
  },
  o2_leak: {
    hr: 126,
    spo2: 92.8,
    coreTemp: 37.4,
    skinTemp: 33.9,
    resp: 24,
    o2Kpa: 5200,
    o2Pct: 24,
    o2Draw: 3.1,
    co2: 2.3,
    scrubberPct: 79,
    ventLpm: 148,
    suitKpa: 24.1,
    leakRate: 0.42,
    coolingPct: 89,
    humidityPct: 38,
    extTemp: -124,
    suitTemp: 20.1,
    radMSv: 0.09,
    commPct: 89,
    batteryPct: 76,
  },
  co2_saturation: {
    hr: 118,
    spo2: 94.1,
    coreTemp: 37.5,
    skinTemp: 34.6,
    resp: 28,
    o2Kpa: 13200,
    o2Pct: 64,
    o2Draw: 1.45,
    co2: 9.2,
    scrubberPct: 14,
    ventLpm: 128,
    suitKpa: 29.5,
    leakRate: 0.011,
    coolingPct: 83,
    humidityPct: 68,
    extTemp: 42,
    suitTemp: 25.4,
    radMSv: 0.1,
    commPct: 92,
    batteryPct: 69,
  },
  thermal_spike: {
    hr: 134,
    spo2: 96.2,
    coreTemp: 38.6,
    skinTemp: 36.8,
    resp: 25,
    o2Kpa: 14800,
    o2Pct: 71,
    o2Draw: 1.38,
    co2: 2.6,
    scrubberPct: 74,
    ventLpm: 158,
    suitKpa: 29.8,
    leakRate: 0.01,
    coolingPct: 36,
    humidityPct: 78,
    extTemp: 118,
    suitTemp: 32.9,
    radMSv: 0.12,
    commPct: 90,
    batteryPct: 62,
  },
  low_power: {
    hr: 96,
    spo2: 97.4,
    coreTemp: 36.5,
    skinTemp: 31.6,
    resp: 18,
    o2Kpa: 11900,
    o2Pct: 58,
    o2Draw: 0.98,
    co2: 3.3,
    scrubberPct: 64,
    ventLpm: 122,
    suitKpa: 29.2,
    leakRate: 0.014,
    coolingPct: 71,
    humidityPct: 52,
    extTemp: -158,
    suitTemp: 16.4,
    radMSv: 0.07,
    commPct: 34,
    batteryPct: 16,
  },
  radiation_storm: {
    hr: 108,
    spo2: 97.6,
    coreTemp: 37.3,
    skinTemp: 33.8,
    resp: 21,
    o2Kpa: 15600,
    o2Pct: 75,
    o2Draw: 1.15,
    co2: 1.9,
    scrubberPct: 81,
    ventLpm: 165,
    suitKpa: 29.6,
    leakRate: 0.009,
    coolingPct: 88,
    humidityPct: 47,
    extTemp: 64,
    suitTemp: 23.1,
    radMSv: 14.8,
    commPct: 56,
    batteryPct: 72,
  },
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function maxSeverity(...items: SeverityStatus[]): SeverityStatus {
  if (items.includes("critical")) return "critical";
  if (items.includes("warning")) return "warning";
  return "normal";
}

function bandHighBad(value: number, warnAt: number, critAt: number): SeverityStatus {
  if (value >= critAt) return "critical";
  if (value >= warnAt) return "warning";
  return "normal";
}

function bandLowBad(value: number, warnAt: number, critAt: number): SeverityStatus {
  if (value <= critAt) return "critical";
  if (value <= warnAt) return "warning";
  return "normal";
}

export function buildTelemetrySnapshot(
  scenarioId: SuitScenarioId,
  elapsedSec = 0,
  timestampStr = "T+02:14:08 EVA",
): SuitTelemetrySnapshot {
  const b = SCENARIO_BASELINES[scenarioId];
  const waveA = Math.sin(elapsedSec * 0.7);
  const waveB = Math.cos(elapsedSec * 0.43);

  const hrVal = Math.round(b.hr + waveA * 2.2);
  const spo2Val = round1(Math.min(100, b.spo2 + waveB * 0.2));
  const coreTempVal = round1(b.coreTemp + waveA * 0.05);
  const skinTempVal = round1(b.skinTemp + waveB * 0.12);
  const respVal = Math.round(b.resp + waveA * 0.8);

  const o2KpaVal = Math.round(b.o2Kpa + waveB * 35);
  const o2PsiVal = Math.round(o2KpaVal * 0.145038);
  const o2PctVal = round1(Math.max(0, Math.min(100, b.o2Pct + waveB * 0.15)));
  const o2DrawVal = round2(Math.max(0.4, b.o2Draw + waveA * 0.03));

  const co2Val = round1(Math.max(0.2, b.co2 + waveA * 0.12));
  const scrubberPctVal = round1(Math.max(0, Math.min(100, b.scrubberPct + waveB * 0.2)));
  const ventVal = Math.round(b.ventLpm + waveA * 2);
  const suitKpaVal = round1(b.suitKpa + waveB * 0.08);
  const leakVal = round3(Math.max(0.002, b.leakRate + Math.abs(waveA) * 0.004));
  const coolingPctVal = Math.round(Math.max(0, Math.min(100, b.coolingPct + waveB * 1.1)));
  const humidityPctVal = Math.round(Math.max(15, Math.min(95, b.humidityPct + waveA * 1.2)));

  const extTempVal = Math.round(b.extTemp + waveA * 1.5);
  const suitTempVal = round1(b.suitTemp + waveB * 0.2);
  const radVal = round2(Math.max(0.02, b.radMSv + waveA * (b.radMSv > 1 ? 0.35 : 0.01)));
  const commPctVal = Math.round(Math.max(5, Math.min(100, b.commPct + waveB * 2)));
  const commDbmVal = Math.round(-115 + (commPctVal / 100) * 58);
  const batteryPctVal = round1(Math.max(0, Math.min(100, b.batteryPct + waveB * 0.1)));

  // Threshold classifications
  const hrStatus = bandHighBad(hrVal, 108, 125);
  const spo2Status = bandLowBad(spo2Val, 95, 93);
  const coreTempStatus = bandHighBad(coreTempVal, 37.8, 38.4);
  const skinTempStatus =
    skinTempVal >= 36.0
      ? "critical"
      : skinTempVal >= 35.0 || skinTempVal <= 31.8
        ? "warning"
        : "normal";
  const respStatus = bandHighBad(respVal, 21, 25);

  const o2PressureStatus = bandLowBad(o2KpaVal, 7500, 5500);
  const o2PctStatus = bandLowBad(o2PctVal, 35, 25);
  const co2Status = bandHighBad(co2Val, 3.0, 7.5);
  const scrubberStatusBand = bandLowBad(scrubberPctVal, 30, 18);
  const ventStatus = bandLowBad(ventVal, 138, 125);
  const suitPressureStatus = bandLowBad(suitKpaVal, 26.8, 24.8);
  const leakStatus = bandHighBad(leakVal, 0.05, 0.25);
  const coolingStatus = bandLowBad(coolingPctVal, 72, 48);
  const humidityStatus = bandHighBad(humidityPctVal, 65, 76);

  const extTempStatus: SeverityStatus =
    Math.abs(extTempVal) >= 145 ? "warning" : "normal";
  const suitInternalTempStatus = bandHighBad(suitTempVal, 27.0, 31.0);
  const radStatus = bandHighBad(radVal, 1.0, 5.0);
  const commStatus = bandLowBad(commPctVal, 60, 40);
  const batteryStatus = bandLowBad(batteryPctVal, 30, 18);

  const vitalOverall = maxSeverity(hrStatus, spo2Status, coreTempStatus, respStatus);
  const stressText =
    vitalOverall === "critical"
      ? "High / Acute Strain"
      : vitalOverall === "warning"
        ? "Elevated Effort"
        : "Low / Baseline";
  const conditionText =
    vitalOverall === "critical"
      ? "Alert Required"
      : vitalOverall === "warning"
        ? "Elevated Load"
        : "Fit for EVA";

  const scrubberText =
    scrubberStatusBand === "critical"
      ? "SATURATED"
      : scrubberStatusBand === "warning"
        ? "DEGRADED"
        : "ACTIVE CYCLE";

  const lssOverall = maxSeverity(
    o2PressureStatus,
    o2PctStatus,
    co2Status,
    scrubberStatusBand,
    suitPressureStatus,
    leakStatus,
    coolingStatus,
  );
  const electricalOverall = batteryStatus;
  const commOverall = maxSeverity(commStatus, radStatus === "critical" ? "warning" : "normal");
  const sensorStatus: SeverityStatus = batteryStatus === "critical" ? "warning" : "normal";

  const overallStatus = maxSeverity(vitalOverall, lssOverall, electricalOverall, radStatus, commStatus);

  // Scrubber & battery hours remaining approximations
  const scrubberEstHours = round1((scrubberPctVal / 100) * 9.5 * (co2Val > 5 ? 0.22 : 1));
  const estOperatingHours = round1((batteryPctVal / 100) * 9.2);

  // Build actionable emergency & caution alerts
  const alerts: SuitAlert[] = [];

  if (suitPressureStatus !== "normal" || leakStatus !== "normal" || o2PressureStatus !== "normal") {
    alerts.push({
      id: "alert-o2-pressure",
      severity: maxSeverity(suitPressureStatus, leakStatus, o2PressureStatus) === "critical" ? "critical" : "warning",
      title: leakStatus === "critical" ? "CRITICAL SUIT PRESSURE LEAK" : "O2 Supply Pressure Dropping",
      componentId: suitPressureStatus === "critical" ? "emergency_oxygen_system" : "oxygen_supply",
      componentName: suitPressureStatus === "critical" ? "Emergency Oxygen System & Bladder" : "Oxygen Supply",
      sensorReading: `Suit ${suitKpaVal} kPa · Leak ${leakVal} kPa/min · O2 Tank ${o2PctVal}%`,
      reason:
        "Suit pressure differential and high leak rate exceed nominal TMG/bladder seal tolerance, causing accelerated primary O2 reserve drawdown.",
      recommendedAction:
        "Activate Emergency Oxygen System (SOP) purge readiness, inspect glove/waist wrist disconnect seals, and initiate immediate airlock ingress.",
      timestamp: timestampStr,
    });
  }

  if (co2Status !== "normal" || scrubberStatusBand !== "normal") {
    alerts.push({
      id: "alert-co2-saturation",
      severity: maxSeverity(co2Status, scrubberStatusBand) === "critical" ? "critical" : "warning",
      title: co2Status === "critical" ? "CRITICAL HYPERCAPNIA / CO2 SPIKE" : "CO2 Scrubber Capacity Low",
      componentId: "co2_removal",
      componentName: "CO2 Removal System",
      sensorReading: `pCO2 ${co2Val} mmHg · Scrubber ${scrubberPctVal}%`,
      reason:
        "Amine scrubber adsorption efficiency has dropped below nominal equilibrium, raising inspired CO2 partial pressure and astronaut respiratory drive.",
      recommendedAction:
        "Switch to secondary scrubber bed cycle, reduce metabolic exertion pace, and abort traverse if pCO2 stays above 5.0 mmHg.",
      timestamp: timestampStr,
    });
  }

  if (coolingStatus !== "normal" || coreTempStatus !== "normal" || suitInternalTempStatus !== "normal") {
    alerts.push({
      id: "alert-thermal-cooling",
      severity: maxSeverity(coolingStatus, coreTempStatus, suitInternalTempStatus) === "critical" ? "critical" : "warning",
      title: coolingStatus === "critical" ? "COOLING LOOP THERMAL OVERLOAD" : "Thermal Loop Efficiency Reduced",
      componentId: "cooling_system",
      componentName: "Cooling System",
      sensorReading: `Cooling ${coolingPctVal}% · Core ${coreTempVal}°C · Suit ${suitTempVal}°C`,
      reason:
        "Sublimator feed-water heat rejection rate dropped below metabolic load, elevating LCVG coolant return temperature and physiological heart rate.",
      recommendedAction:
        "Move to shadowed zone, set DCM cooling valve to MAX, verify sublimator feed water flow, and lower physical workload.",
      timestamp: timestampStr,
    });
  }

  if (batteryStatus !== "normal" || commStatus !== "normal") {
    alerts.push({
      id: "alert-power-comm",
      severity: maxSeverity(batteryStatus, commStatus) === "critical" ? "critical" : "warning",
      title: batteryStatus === "critical" ? "LOW BATTERY POWER RESERVE" : "Telemetry & RF Signal Weak",
      componentId: batteryStatus !== "normal" ? "electrical_power" : "communication_system",
      componentName: batteryStatus !== "normal" ? "Electrical Power" : "Communication System",
      sensorReading: `Battery ${batteryPctVal}% (${estOperatingHours}h) · Signal ${commPctVal}% (${commDbmVal} dBm)`,
      reason:
        "Remaining battery state-of-charge or RF link SNR fell below nominal EVA return safety reserve margins.",
      recommendedAction:
        "Reduce auxiliary visor heater load, switch comm relay to high-gain orbital link, and proceed toward habitat umbilical recharge.",
      timestamp: timestampStr,
    });
  }

  if (radStatus !== "normal") {
    alerts.push({
      id: "alert-radiation-spe",
      severity: radStatus === "critical" ? "critical" : "warning",
      title: "SOLAR PARTICLE RADIATION FLUX ALERT",
      componentId: "thermal_protection_layers",
      componentName: "Thermal Protection Layers",
      sensorReading: `Radiation ${radVal} mSv/h (SPE Flux Elevated)`,
      reason:
        "External helmet/torso dosimeters detected elevated high-energy proton flux exceeding nominal EVA radiation shielding baseline.",
      recommendedAction:
        "Terminate surface EVA immediately and relocate inside storm-shielded habitat or rover module.",
      timestamp: timestampStr,
    });
  }

  return {
    isSimulated: true,
    disclosure: "SIMULATED DEMONSTRATION DATA — Educational EVA telemetry model, not flight hardware output.",
    scenarioId,
    overallStatus,
    vitals: {
      heartRateBpm: { value: hrVal, status: hrStatus },
      spo2Pct: { value: spo2Val, status: spo2Status },
      coreTempC: { value: coreTempVal, status: coreTempStatus },
      skinTempC: { value: skinTempVal, status: skinTempStatus },
      respiratoryRateBpm: { value: respVal, status: respStatus },
      physicalCondition: { value: conditionText, status: vitalOverall },
      stressLevel: { value: stressText, status: vitalOverall },
    },
    lifeSupport: {
      o2TankPressureKpa: { value: o2KpaVal, status: o2PressureStatus },
      o2TankPressurePsi: o2PsiVal,
      remainingO2Pct: { value: o2PctVal, status: o2PctStatus },
      o2ConsumptionLpm: o2DrawVal,
      co2MmHg: { value: co2Val, status: co2Status },
      co2ScrubberStatus: { value: scrubberText, status: scrubberStatusBand },
      scrubberRemainingPct: { value: scrubberPctVal, status: scrubberStatusBand },
      scrubberEstHours,
      ventilationLpm: { value: ventVal, status: ventStatus },
      suitPressureKpa: { value: suitKpaVal, status: suitPressureStatus },
      leakRateKpaPerMin: { value: leakVal, status: leakStatus },
      coolingPerformancePct: { value: coolingPctVal, status: coolingStatus },
      humidityPct: { value: humidityPctVal, status: humidityStatus },
    },
    environment: {
      externalTempC: { value: extTempVal, status: extTempStatus },
      suitInternalTempC: { value: suitTempVal, status: suitInternalTempStatus },
      radiationMSvPerHr: { value: radVal, status: radStatus },
      ambientPressureKpa: 0.0,
      externalO2Pct: 0.0,
      commSignalStrengthPct: { value: commPctVal, status: commStatus },
      commSignalDbm: commDbmVal,
    },
    power: {
      batteryPct: { value: batteryPctVal, status: batteryStatus },
      estOperatingHours,
      electricalStatus: {
        value: electricalOverall === "critical" ? "CRITICAL" : electricalOverall === "warning" ? "LOW RESERVE" : "NOMINAL",
        status: electricalOverall,
      },
      lifeSupportStatus: {
        value: lssOverall === "critical" ? "FAULT" : lssOverall === "warning" ? "DEGRADED" : "NOMINAL",
        status: lssOverall,
      },
      sensorNetworkStatus: {
        value: sensorStatus === "warning" ? "POWER SAVING" : "NOMINAL",
        status: sensorStatus,
      },
      commLinkStatus: {
        value: commOverall === "critical" ? "WEAK LINK" : commOverall === "warning" ? "ATTENUATED" : "LOCKED",
        status: commOverall,
      },
    },
    alerts,
  };
}

export function generate48HourForecast(snapshot: SuitTelemetrySnapshot): Suit48HourForecast {
  const { scenarioId, lifeSupport, power } = snapshot;

  // Hourly burn / degradation rates under modeled scenario without external umbilical replenishment
  const o2RatePerHr =
    scenarioId === "o2_leak"
      ? 14.8
      : scenarioId === "co2_saturation"
        ? 4.6
        : scenarioId === "thermal_spike"
          ? 4.2
          : 3.1; // Nominal 8.5h autonomous tank + 24h habitat refill cycle baseline

  const scrubberRatePerHr =
    scenarioId === "co2_saturation"
      ? 9.5
      : scenarioId === "thermal_spike"
        ? 3.8
        : 2.2;

  const batteryRatePerHr =
    scenarioId === "low_power"
      ? 7.2
      : scenarioId === "thermal_spike"
        ? 4.8
        : 2.4;

  const coolingDecayPerHr =
    scenarioId === "thermal_spike"
      ? 2.8
      : scenarioId === "low_power"
        ? 1.1
        : 0.35;

  const horizons: (0 | 6 | 12 | 24 | 48)[] = [0, 6, 12, 24, 48];
  const o2Start = lifeSupport.remainingO2Pct.value;
  const scrubStart = lifeSupport.scrubberRemainingPct.value;
  const batStart = power.batteryPct.value;
  const coolStart = lifeSupport.coolingPerformancePct.value;

  const points: ForecastHorizonPoint[] = horizons.map((h) => {
    const o2 = round1(Math.max(0, o2Start - o2RatePerHr * h));
    const scrub = round1(Math.max(0, scrubStart - scrubberRatePerHr * h));
    const bat = round1(Math.max(0, batStart - batteryRatePerHr * h));
    const cool = round1(Math.max(0, coolStart - coolingDecayPerHr * h));

    const health = Math.round(o2 * 0.32 + scrub * 0.25 + bat * 0.25 + cool * 0.18);
    const riskBand: SeverityStatus =
      health < 35 || o2 <= 10 || scrub <= 10 || bat <= 10
        ? "critical"
        : health < 68 || o2 < 35 || scrub < 30 || bat < 30
          ? "warning"
          : "normal";

    let maintenanceNote = "Autonomous PLSS within normal tolerance";
    if (o2 <= 0 || scrub <= 0 || bat <= 0) {
      maintenanceNote = "Autonomous suit consumables depleted — requires airlock / umbilical recharge";
    } else if (riskBand === "critical") {
      maintenanceNote = "Critical consumable threshold crossed; EVA termination required prior to mark";
    } else if (riskBand === "warning") {
      maintenanceNote = "Reserve margin below 35%; schedule PLSS recharge / cartridge swap";
    }

    return {
      horizonHours: h,
      label: h === 0 ? "Current" : `+${h}h`,
      remainingO2Pct: o2,
      scrubberRemainingPct: scrub,
      batteryPct: bat,
      coolingPerformancePct: cool,
      systemHealthScore: health,
      riskBand,
      maintenanceNote,
    };
  });

  const o2DepletionHours = round1(o2Start / o2RatePerHr);
  const co2SaturationHours = round1(scrubStart / scrubberRatePerHr);
  const batteryDepletionHours = round1(batStart / batteryRatePerHr);

  const warnings: string[] = [
    `Autonomous O2 exhaustion projected in ${o2DepletionHours}h at current ${lifeSupport.o2ConsumptionLpm} L/min & leak rate.`,
    `CO2 scrubber saturation projected in ${co2SaturationHours}h without amine bed cycle or habitat regen.`,
    `Battery depletion projected in ${batteryDepletionHours}h at current DC avionics & thermal load.`,
  ];

  if (scenarioId === "radiation_storm") {
    warnings.unshift("Solar Particle Event flux trajectory remains unsafe for unshielded EVA over 6–24h window.");
  }

  return {
    isSimulated: true,
    scenarioId,
    points,
    o2DepletionHours,
    co2SaturationHours,
    batteryDepletionHours,
    warnings,
    assumptions: [
      "Forecast curves distinguish simulated extrapolation from current instantaneous values and project unreplenished portable suit consumables over a 48h planning window.",
      "Portable EVA PLSS units carry ~8–10h autonomous capacity (depending on exertion and leak rate); values hitting 0% after +6h/+12h indicate mandatory airlock umbilical recharge.",
      "No clinical diagnosis is implied; use for aerospace mission planning and educational simulation.",
    ],
  };
}
