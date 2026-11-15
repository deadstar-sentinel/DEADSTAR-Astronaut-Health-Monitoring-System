import { Focus, Maximize2, Minus, Pause, Play, Plus, RotateCcw, Shield, User } from "lucide-react";
import { CAMERA_PRESETS, type CameraPresetId } from "../../data/anatomyCatalog.ts";
import {
  EMERGENCY_BY_ID,
  SEVERITY_META,
  maxLevel,
  severityHex,
} from "../../data/emergencyScenarios.ts";
import { displayedLevel, timelineFinished, type EmergencyState, type EmergencyView } from "../../utils/emergencyState.ts";

interface Props {
  emergency: EmergencyState;
  suitActive: boolean;
  isolated: boolean;
  onSetStage: (stage: number) => void;
  onStep: (delta: number) => void;
  onTogglePause: () => void;
  onReset: () => void;
  onView: (view: EmergencyView) => void;
  onIsolate: () => void;
  onFullBody: () => void;
  onToggleSuit: (active: boolean) => void;
  onCameraPreset: (preset: CameraPresetId) => void;
}

const VIEWS: [EmergencyView, string][] = [
  ["normal", "Normal"],
  ["emergency", "Emergency"],
  ["compare", "Compare"],
];

export function EmergencyTimelineBar({
  emergency,
  suitActive,
  isolated,
  onSetStage,
  onStep,
  onTogglePause,
  onReset,
  onView,
  onIsolate,
  onFullBody,
  onToggleSuit,
  onCameraPreset,
}: Props) {
  const scenario = emergency.activeScenarioId ? EMERGENCY_BY_ID[emergency.activeScenarioId] : null;
  const level = displayedLevel(emergency);
  const btn =
    "sx-press px-2 py-1 border text-[10px] font-mono uppercase flex items-center gap-1 transition-colors disabled:opacity-35 disabled:pointer-events-none";
  const idle = "bg-[#030914] border-cyan-500/25 text-slate-300 hover:text-white hover:border-cyan-300";

  if (!scenario) {
    return (
      <footer
        data-testid="emergency-timeline"
        className="min-h-14 shrink-0 bg-[#051020] border-t border-rose-400/25 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-400">Simulation status</span>
            <span className="text-xs font-mono text-cyan-200">
              STANDBY · {suitActive ? "ASTRONAUT SUIT (X-RAY OVERLAY)" : "NORMAL ANATOMY"}
            </span>
          </div>
          <span className="hidden md:inline text-[11px] text-slate-400 truncate">
            Select a scenario and press Activate simulation.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SuitSwitch suitActive={suitActive} onToggleSuit={onToggleSuit} />
          <Presets onCameraPreset={onCameraPreset} />
        </div>
      </footer>
    );
  }

  const max = maxLevel(scenario);
  const finished = timelineFinished(emergency);
  const sev = SEVERITY_META[emergency.stage];
  const stageColor = severityHex(emergency.stage);

  return (
    <footer
      data-testid="emergency-timeline"
      className="shrink-0 bg-[#051020] border-t px-3 py-2 flex flex-col gap-2 transition-colors duration-500"
      style={{ borderTopColor: `${stageColor}66` }}
    >
      {/* Timeline */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col w-44 shrink-0 min-w-0">
          <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-400">
            {emergency.paused ? "Paused" : finished ? "Final stage" : "Simulating"} · {emergency.view}
          </span>
          <span className="text-xs text-white truncate" title={scenario.name}>{scenario.name}</span>
        </div>
        <ol className="flex-1 min-w-0 flex items-center" aria-label="Scenario timeline">
          {scenario.stages.map((label, i) => {
            const reached = i <= emergency.stage;
            const current = i === emergency.stage;
            const c = severityHex(i);
            return (
              <li key={label} className="flex-1 min-w-0 flex items-center">
                {i > 0 && (
                  <span
                    className="h-px flex-1 transition-colors duration-500"
                    style={{ background: reached ? c : "rgba(0,229,255,0.15)" }}
                  />
                )}
                <button
                  type="button"
                  data-testid={`em-stage-${i}`}
                  onClick={() => onSetStage(i)}
                  title={`${label} (L${i} ${SEVERITY_META[i].label})`}
                  aria-current={current ? "step" : undefined}
                  className="group relative flex flex-col items-center px-2 py-2 -my-2"
                >
                  <span
                    className={`block w-3 h-3 border-2 rotate-45 transition-all duration-300 ${current ? "scale-125" : ""} ${current && i === 4 ? "animate-pulse" : ""}`}
                    style={{ borderColor: reached ? c : "rgba(148,163,184,0.45)", background: current ? c : reached ? `${c}55` : "transparent" }}
                  />
                  <span
                    className={`hidden md:block absolute top-4 text-[9px] font-mono whitespace-nowrap ${current ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`}
                  >
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="shrink-0 text-right w-28">
          <div className={`text-[11px] font-mono uppercase ${sev.text}`}>L{emergency.stage} · {sev.label}</div>
          <div className="text-[9px] font-mono text-slate-500">shown: L{level}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-1.5 md:pt-2.5">
        <button type="button" data-testid="em-pause" onClick={onTogglePause} className={`${btn} ${idle}`}>
          {emergency.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          {emergency.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" data-testid="em-dec" onClick={() => onStep(-1)} disabled={emergency.stage <= 0} className={`${btn} ${idle}`} title="Decrease intensity">
          <Minus className="w-3 h-3" /> Intensity
        </button>
        <button type="button" data-testid="em-inc" onClick={() => onStep(1)} disabled={emergency.stage >= max} className={`${btn} ${idle}`} title="Increase intensity">
          <Plus className="w-3 h-3" /> Intensity
        </button>

        <div className="flex items-center border border-cyan-500/25 bg-[#030914]" role="group" aria-label="Normal versus emergency view">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              data-testid={`em-view-${v}`}
              onClick={() => onView(v)}
              aria-pressed={emergency.view === v}
              className={`px-2 py-1 text-[10px] font-mono uppercase border-r border-cyan-500/15 last:border-r-0 transition-colors ${
                emergency.view === v ? "bg-rose-500/20 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {scenario.fx.primary &&
          (isolated ? (
            <button type="button" onClick={onFullBody} className={`${btn} ${idle}`}>
              <Maximize2 className="w-3 h-3" /> Full body
            </button>
          ) : (
            <button type="button" data-testid="em-isolate" onClick={onIsolate} className={`${btn} ${idle}`}>
              <Focus className="w-3 h-3" /> Isolate organ
            </button>
          ))}

        <SuitSwitch suitActive={suitActive} onToggleSuit={onToggleSuit} />

        <button
          type="button"
          data-testid="em-reset-bar"
          onClick={onReset}
          className={`${btn} ml-auto bg-cyan-500/15 border-cyan-300 text-cyan-100 hover:bg-cyan-500/25`}
        >
          <RotateCcw className="w-3 h-3" /> Reset to normal
        </button>
        <Presets onCameraPreset={onCameraPreset} />
      </div>
    </footer>
  );
}

function SuitSwitch({ suitActive, onToggleSuit }: { suitActive: boolean; onToggleSuit: (a: boolean) => void }) {
  return (
    <button
      type="button"
      data-testid="em-suit-toggle"
      onClick={() => onToggleSuit(!suitActive)}
      className={`sx-press px-2 py-1 border text-[10px] font-mono uppercase flex items-center gap-1 transition-colors ${
        suitActive ? "bg-violet-500/20 border-violet-400/70 text-violet-100" : "bg-[#030914] border-cyan-500/25 text-slate-300 hover:text-white"
      }`}
    >
      {suitActive ? <User className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
      {suitActive ? "Normal human" : "Astronaut mode"}
    </button>
  );
}

function Presets({ onCameraPreset }: { onCameraPreset: (p: CameraPresetId) => void }) {
  const order: CameraPresetId[] = ["front", "back", "left", "right", "reset"];
  return (
    <div className="hidden xl:flex items-center border border-cyan-500/20 bg-[#030914]">
      {order.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onCameraPreset(p)}
          className="px-1.5 py-1 text-[10px] font-mono uppercase text-slate-400 hover:text-white hover:bg-cyan-500/15 border-r border-cyan-500/15 last:border-r-0"
        >
          {p === "reset" ? <RotateCcw className="w-3 h-3" /> : CAMERA_PRESETS[p].label}
        </button>
      ))}
    </div>
  );
}
