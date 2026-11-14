import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bot,
  Crosshair,
  Gauge,
  HeartPulse,
  Radio,
  ShieldAlert,
  Thermometer,
  TrendingDown,
  Wind,
  X,
} from "lucide-react";
import type { SuitComponentId } from "../data/spacesuitCatalog.ts";
import {
  generate48HourForecast,
  SUIT_SCENARIOS,
  type SeverityStatus,
  type SuitAlert,
  type SuitScenarioId,
  type SuitTelemetrySnapshot,
} from "../utils/telemetryEngine.ts";

interface SpacesuitTelemetryModalProps {
  isOpen: boolean;
  snapshot: SuitTelemetrySnapshot;
  scenarioId: SuitScenarioId;
  onClose: () => void;
  onSelectScenario: (id: SuitScenarioId) => void;
  onInspectComponent: (id: SuitComponentId) => void;
  onAskAiAlert: (alert: SuitAlert) => void;
}

const STATUS_STYLE: Record<SeverityStatus, string> = {
  normal: "text-emerald-300 border-emerald-500/35 bg-emerald-500/10",
  warning: "text-orange-300 border-orange-400/45 bg-orange-500/15",
  critical: "text-rose-300 border-rose-500/55 bg-rose-500/20",
};

const TEXT_STATUS_COLOR: Record<SeverityStatus, string> = {
  normal: "text-cyan-200",
  warning: "text-orange-300",
  critical: "text-rose-400",
};

export function SpacesuitTelemetryModal({
  isOpen,
  snapshot,
  scenarioId,
  onClose,
  onSelectScenario,
  onInspectComponent,
  onAskAiAlert,
}: SpacesuitTelemetryModalProps) {
  if (!isOpen) return null;

  const forecast = generate48HourForecast(snapshot);
  const { vitals, lifeSupport, environment, power, alerts } = snapshot;

  // Build SVG polyline points for 48h forecast chart (viewBox 0 0 420 150)
  const xs = [28, 120, 212, 304, 396];
  const toY = (pct: number) => Math.round(132 - (Math.max(0, Math.min(100, pct)) / 100) * 112);
  const lineFor = (picker: (idx: number) => number) =>
    forecast.points.map((_p, idx) => `${xs[idx]},${toY(picker(idx))}`).join(" ");

  return (
    <div
      data-testid="ai-monitoring-modal"
      role="dialog"
      aria-modal="true"
      aria-label="AI Spacesuit Monitoring Dashboard and 48-Hour Predictive Forecast"
      className="fixed inset-0 z-50 bg-[#020712]/90 flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#040d1b] border border-cyan-400/40 shadow-[0_0_50px_rgba(0,140,255,0.22)] flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-4 py-3 bg-[#061426] border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Activity className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold tracking-[0.14em] uppercase text-white">
                  AI Spacesuit Life-Support & Telemetry HUD
                </h2>
                <span className="px-2 py-0.5 border border-cyan-400/40 bg-cyan-500/15 text-[10px] font-mono uppercase tracking-wider text-cyan-200">
                  Simulated Demonstration Data
                </span>
                <span
                  data-testid="telemetry-overall-badge"
                  className={`px-2 py-0.5 border text-[10px] font-mono uppercase tracking-wider ${STATUS_STYLE[snapshot.overallStatus]}`}
                >
                  {snapshot.overallStatus === "critical"
                    ? "CRITICAL EMERGENCY"
                    : snapshot.overallStatus === "warning"
                      ? "CAUTION ACTIVE"
                      : "ALL SYSTEMS NORMAL"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{snapshot.disclosure}</p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-telemetry-modal"
            onClick={onClose}
            aria-label="Close AI Monitoring Dashboard"
            className="px-2.5 py-1.5 border border-cyan-500/30 bg-[#040b18] text-xs font-mono text-slate-200 hover:border-cyan-300 hover:text-white flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            Close HUD
          </button>
        </div>

        {/* Simulation Scenario Selector / Fault Injector */}
        <div className="px-4 py-2.5 bg-[#051122] border-b border-cyan-500/20 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300 mr-1">
            Simulation Scenario:
          </span>
          {SUIT_SCENARIOS.map((sc) => {
            const active = scenarioId === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                data-testid={`scenario-${sc.id}`}
                onClick={() => onSelectScenario(sc.id)}
                className={`px-2.5 py-1 border text-[11px] font-mono transition-colors ${
                  active
                    ? sc.id === "nominal"
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-100"
                      : "bg-rose-500/20 border-rose-400 text-rose-100"
                    : "bg-[#030914] border-cyan-500/20 text-slate-300 hover:border-cyan-400/50"
                }`}
              >
                {sc.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Scrollable Telemetry & 48h Forecast Workspace */}
        <div className="flex-1 overflow-y-auto med-scroll p-4 space-y-4">
          {/* Emergency & Caution Alerts Strip */}
          {alerts.length > 0 && (
            <section
              data-testid="emergency-alerts-section"
              className="border border-rose-500/45 bg-[#160812] p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-rose-300 font-mono text-xs uppercase tracking-[0.14em]">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Active Emergency & Caution Alerts ({alerts.length})</span>
                </div>
                <span className="text-[10px] font-mono text-rose-200/80">
                  SIMULATED FAULT DIAGNOSTICS
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {alerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-3 border space-y-1.5 ${
                      al.severity === "critical"
                        ? "bg-[#1f0a17] border-rose-500/50"
                        : "bg-[#1b1207] border-orange-400/45"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 ${
                            al.severity === "critical" ? "text-rose-400" : "text-orange-400"
                          }`}
                        />
                        <span className="text-xs font-semibold text-white">{al.title}</span>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                        {al.timestamp}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-cyan-200">{al.sensorReading}</div>
                    <p className="text-xs text-slate-200 leading-relaxed">{al.reason}</p>
                    <div className="text-[11px] text-amber-200/90 bg-black/25 border border-white/10 p-2">
                      <span className="font-mono uppercase text-[10px] text-amber-300 mr-1">
                        Response Reference:
                      </span>
                      {al.recommendedAction}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onInspectComponent(al.componentId)}
                        className="px-2 py-1 border border-cyan-400/40 bg-[#05152a] text-[10px] font-mono uppercase text-cyan-200 hover:border-cyan-300 flex items-center gap-1"
                      >
                        <Crosshair className="w-3 h-3" />
                        Inspect {al.componentName}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAskAiAlert(al)}
                        className="px-2 py-1 border border-violet-400/40 bg-[#120b28] text-[10px] font-mono uppercase text-violet-200 hover:border-violet-300 flex items-center gap-1"
                      >
                        <Bot className="w-3 h-3" />
                        Explain Cause with AI
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4-Domain Telemetry Grid: A Vitals | B Life Support | C Environmental | D Power & Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* A. Vital Signs Monitoring */}
            <section className="p-3.5 bg-[#051020] border border-cyan-500/20 space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/15 pb-2">
                <div className="flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-rose-400" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-cyan-300">
                    A. Astronaut Vital Signs
                  </h3>
                </div>
                <span
                  className={`px-1.5 py-0.5 border text-[10px] font-mono ${STATUS_STYLE[vitals.physicalCondition.status]}`}
                >
                  {vitals.physicalCondition.value}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricTile
                  label="Heart Rate"
                  value={`${vitals.heartRateBpm.value} BPM`}
                  status={vitals.heartRateBpm.status}
                />
                <MetricTile
                  label="Blood Oxygen (SpO2)"
                  value={`${vitals.spo2Pct.value}%`}
                  status={vitals.spo2Pct.status}
                />
                <MetricTile
                  label="Core Body Temp"
                  value={`${vitals.coreTempC.value} °C`}
                  status={vitals.coreTempC.status}
                />
                <MetricTile
                  label="Skin Temperature"
                  value={`${vitals.skinTempC.value} °C`}
                  status={vitals.skinTempC.status}
                />
                <MetricTile
                  label="Respiratory Rate"
                  value={`${vitals.respiratoryRateBpm.value} br/min`}
                  status={vitals.respiratoryRateBpm.status}
                />
                <MetricTile
                  label="Physiological Stress"
                  value={vitals.stressLevel.value}
                  status={vitals.stressLevel.status}
                />
              </div>
            </section>

            {/* B. Life Support System Monitoring */}
            <section className="p-3.5 bg-[#051020] border border-cyan-500/20 space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/15 pb-2">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-cyan-300">
                    B. Life Support Systems (PLSS)
                  </h3>
                </div>
                <span
                  className={`px-1.5 py-0.5 border text-[10px] font-mono ${STATUS_STYLE[power.lifeSupportStatus.status]}`}
                >
                  {power.lifeSupportStatus.value}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricTile
                  label="O2 Tank Pressure"
                  value={`${lifeSupport.o2TankPressureKpa.value} kPa`}
                  sub={`${lifeSupport.o2TankPressurePsi} psi`}
                  status={lifeSupport.o2TankPressureKpa.status}
                />
                <MetricTile
                  label="Remaining O2"
                  value={`${lifeSupport.remainingO2Pct.value}%`}
                  sub={`${lifeSupport.o2ConsumptionLpm} L/min draw`}
                  status={lifeSupport.remainingO2Pct.status}
                />
                <MetricTile
                  label="CO2 Concentration"
                  value={`${lifeSupport.co2MmHg.value} mmHg`}
                  status={lifeSupport.co2MmHg.status}
                />
                <MetricTile
                  label="CO2 Scrubber"
                  value={`${lifeSupport.scrubberRemainingPct.value}%`}
                  sub={`${lifeSupport.co2ScrubberStatus.value} (${lifeSupport.scrubberEstHours}h)`}
                  status={lifeSupport.scrubberRemainingPct.status}
                />
                <MetricTile
                  label="Suit Pressure"
                  value={`${lifeSupport.suitPressureKpa.value} kPa`}
                  sub={`Leak ${lifeSupport.leakRateKpaPerMin.value} kPa/min`}
                  status={
                    lifeSupport.suitPressureKpa.status === "critical" ||
                    lifeSupport.leakRateKpaPerMin.status === "critical"
                      ? "critical"
                      : lifeSupport.suitPressureKpa.status === "warning" ||
                          lifeSupport.leakRateKpaPerMin.status === "warning"
                        ? "warning"
                        : "normal"
                  }
                />
                <MetricTile
                  label="Cooling & Humidity"
                  value={`${lifeSupport.coolingPerformancePct.value}%`}
                  sub={`RH ${lifeSupport.humidityPct.value}% · ${lifeSupport.ventilationLpm.value} L/m`}
                  status={lifeSupport.coolingPerformancePct.status}
                />
              </div>
            </section>

            {/* C. Environmental Monitoring */}
            <section className="p-3.5 bg-[#051020] border border-cyan-500/20 space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/15 pb-2">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-orange-400" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-cyan-300">
                    C. External & Suit Environment
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">EVA VACUUM</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricTile
                  label="External Temperature"
                  value={`${environment.externalTempC.value} °C`}
                  status={environment.externalTempC.status}
                />
                <MetricTile
                  label="Suit Internal Temp"
                  value={`${environment.suitInternalTempC.value} °C`}
                  status={environment.suitInternalTempC.status}
                />
                <MetricTile
                  label="Radiation Dose Rate"
                  value={`${environment.radiationMSvPerHr.value} mSv/h`}
                  status={environment.radiationMSvPerHr.status}
                />
                <MetricTile
                  label="Ambient Pressure"
                  value={`${environment.ambientPressureKpa.toFixed(1)} kPa`}
                  sub={`Ext O2: ${environment.externalO2Pct.toFixed(1)}%`}
                  status="normal"
                />
                <MetricTile
                  label="Comm Signal Strength"
                  value={`${environment.commSignalStrengthPct.value}%`}
                  sub={`${environment.commSignalDbm} dBm S-Band`}
                  status={environment.commSignalStrengthPct.status}
                />
                <MetricTile
                  label="Airflow Circulation"
                  value={`${lifeSupport.ventilationLpm.value} L/min`}
                  status={lifeSupport.ventilationLpm.status}
                />
              </div>
            </section>

            {/* D. Power & System Status */}
            <section className="p-3.5 bg-[#051020] border border-cyan-500/20 space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/15 pb-2">
                <div className="flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-cyan-300">
                    D. Power & Subsystems Health
                  </h3>
                </div>
                <span className="text-[10px] font-mono tabular-nums text-cyan-200">
                  EST {power.estOperatingHours}h REMAINING
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricTile
                  label="Battery Charge"
                  value={`${power.batteryPct.value}%`}
                  sub={`${power.estOperatingHours}h autonomous`}
                  status={power.batteryPct.status}
                />
                <MetricTile
                  label="Electrical Bus"
                  value={power.electricalStatus.value}
                  status={power.electricalStatus.status}
                />
                <MetricTile
                  label="Life Support Loop"
                  value={power.lifeSupportStatus.value}
                  status={power.lifeSupportStatus.status}
                />
                <MetricTile
                  label="Sensor Network"
                  value={power.sensorNetworkStatus.value}
                  status={power.sensorNetworkStatus.status}
                />
                <MetricTile
                  label="Comm Link"
                  value={power.commLinkStatus.value}
                  status={power.commLinkStatus.status}
                />
                <div className="p-2 bg-[#030914] border border-cyan-500/15 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-slate-400">
                    Quick Inspection
                  </span>
                  <button
                    type="button"
                    onClick={() => onInspectComponent("plss")}
                    className="mt-1 px-2 py-1 border border-cyan-400/35 bg-cyan-500/10 text-[10px] font-mono text-cyan-200 hover:bg-cyan-500/20 flex items-center justify-center gap-1"
                  >
                    <Gauge className="w-3 h-3" />
                    PLSS Core
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* 48-Hour Predictive Monitoring & System Forecast */}
          <section
            data-testid="forecast-48h-section"
            className="p-4 bg-[#051020] border border-violet-400/35 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-400/20 pb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-violet-200">
                  AI Predictive Monitoring — 48-Hour System Trajectory Forecast
                </h3>
              </div>
              <span className="text-[10px] font-mono text-amber-300">
                PREDICTIVE MODEL · REQUIRES HABITAT RECHARGE AFTER ~8–10H AUTONOMOUS EVA
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* SVG Trajectory Plot */}
              <div className="lg:col-span-5 bg-[#030914] border border-cyan-500/20 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono">
                  <span className="text-[#00E5FF]">— O2 Reserve %</span>
                  <span className="text-[#8A5CFF]">— CO2 Scrubber %</span>
                  <span className="text-[#34D399]">— Battery %</span>
                  <span className="text-[#FF8C42]">— Cooling %</span>
                </div>

                <svg viewBox="0 0 420 155" className="w-full h-40">
                  {/* Horizontal grid */}
                  {[0, 25, 50, 75, 100].map((v) => {
                    const y = toY(v);
                    return (
                      <g key={v}>
                        <line x1={24} y1={y} x2={404} y2={y} stroke="#132944" strokeWidth={1} />
                        <text x={2} y={y + 3} fill="#64748B" fontSize="8" fontFamily="monospace">
                          {v}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Vertical horizon markers */}
                  {forecast.points.map((pt, idx) => (
                    <g key={pt.horizonHours}>
                      <line
                        x1={xs[idx]}
                        y1={16}
                        x2={xs[idx]}
                        y2={134}
                        stroke="#132944"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={xs[idx]}
                        y={148}
                        textAnchor="middle"
                        fill="#94A3B8"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {pt.label}
                      </text>
                    </g>
                  ))}

                  {/* Curves */}
                  <polyline
                    fill="none"
                    stroke="#00E5FF"
                    strokeWidth={2.2}
                    points={lineFor((i) => forecast.points[i].remainingO2Pct)}
                  />
                  <polyline
                    fill="none"
                    stroke="#8A5CFF"
                    strokeWidth={2}
                    points={lineFor((i) => forecast.points[i].scrubberRemainingPct)}
                  />
                  <polyline
                    fill="none"
                    stroke="#34D399"
                    strokeWidth={2}
                    points={lineFor((i) => forecast.points[i].batteryPct)}
                  />
                  <polyline
                    fill="none"
                    stroke="#FF8C42"
                    strokeWidth={1.8}
                    strokeDasharray="4 2"
                    points={lineFor((i) => forecast.points[i].coolingPerformancePct)}
                  />
                </svg>

                <div className="space-y-1 text-[11px] text-slate-300">
                  {forecast.warnings.map((w) => (
                    <div key={w} className="flex items-start gap-1.5">
                      <Radio className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Horizon Breakdown Table + Explicit Assumptions */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="overflow-x-auto border border-cyan-500/20 bg-[#030914]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-cyan-500/20 text-[10px] uppercase text-cyan-300 bg-[#07162b]">
                        <th className="px-2.5 py-2">Horizon</th>
                        <th className="px-2.5 py-2">O2 %</th>
                        <th className="px-2.5 py-2">Scrubber</th>
                        <th className="px-2.5 py-2">Battery</th>
                        <th className="px-2.5 py-2">Cooling</th>
                        <th className="px-2.5 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-500/10 tabular-nums">
                      {forecast.points.map((pt) => (
                        <tr key={pt.horizonHours} className="hover:bg-cyan-500/5">
                          <td className="px-2.5 py-1.5 text-white font-semibold">{pt.label}</td>
                          <td className="px-2.5 py-1.5 text-cyan-200">{pt.remainingO2Pct}%</td>
                          <td className="px-2.5 py-1.5 text-violet-200">{pt.scrubberRemainingPct}%</td>
                          <td className="px-2.5 py-1.5 text-emerald-200">{pt.batteryPct}%</td>
                          <td className="px-2.5 py-1.5 text-orange-200">{pt.coolingPerformancePct}%</td>
                          <td className="px-2.5 py-1.5">
                            <span
                              className={`px-1.5 py-0.5 border text-[10px] uppercase ${STATUS_STYLE[pt.riskBand]}`}
                            >
                              {pt.riskBand}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-2.5 bg-[#030914] border border-slate-700/60 text-[11px] text-slate-400 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                    Forecast Methodology & Simulation Assumptions
                  </div>
                  {forecast.assumptions.map((line) => (
                    <p key={line} className="leading-snug">
                      • {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status: SeverityStatus;
}) {
  return (
    <div className="p-2 bg-[#030914] border border-cyan-500/15 flex flex-col justify-between">
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 truncate">
        {label}
      </div>
      <div className={`text-sm font-mono font-semibold tabular-nums mt-0.5 ${TEXT_STATUS_COLOR[status]}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{sub}</div>}
    </div>
  );
}
