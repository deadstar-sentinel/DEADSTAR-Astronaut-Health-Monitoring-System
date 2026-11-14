import { Pause, Play, RotateCcw, Square } from "lucide-react";
import {
  CAMERA_PRESETS,
  VISUALIZATION_MODES,
  type AnimationMode,
  type CameraPresetId,
} from "../data/anatomyCatalog.ts";
import { getSelectedStructure, type SimulationState } from "../utils/simulationState.ts";

interface BottomControlBarProps {
  state: SimulationState;
  onCameraPreset: (preset: CameraPresetId) => void;
  onChangeIntensity: (val: number) => void;
  onChangeAnimationMode: (mode: AnimationMode) => void;
}

const PRESET_ORDER: CameraPresetId[] = ["front", "back", "left", "right", "reset"];

export function BottomControlBar({
  state,
  onCameraPreset,
  onChangeIntensity,
  onChangeAnimationMode,
}: BottomControlBarProps) {
  const selected = getSelectedStructure(state);
  const modeMeta = VISUALIZATION_MODES.find((m) => m.id === state.mode);

  return (
    <footer className="min-h-14 shrink-0 bg-[#051020] border-t border-cyan-500/20 px-3 py-1.5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 lg:gap-3">
      {/* Left: System status & selected structure */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
            Status
          </span>
          <span className="text-xs font-mono text-emerald-300">ONLINE</span>
        </div>
        <div className="h-5 w-px bg-cyan-500/20" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-400">
            Selected Structure
          </span>
          <span className="text-xs font-medium text-cyan-200 truncate max-w-[150px]">
            {selected ? `${selected.name}${state.isolated ? " (Isolated)" : ""}` : "Complete Body"}
          </span>
        </div>
        <div className="hidden xl:flex flex-col">
          <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-400">
            Active Layer
          </span>
          <span className="text-xs font-mono text-slate-200">{modeMeta?.label}</span>
        </div>
      </div>

      {/* Center: Camera Presets & Visualization Intensity */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center border border-cyan-500/20 bg-[#030914]">
          {PRESET_ORDER.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`cam-${preset}`}
              onClick={() => onCameraPreset(preset)}
              className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-300 hover:text-white hover:bg-cyan-500/15 border-r border-cyan-500/15 last:border-r-0 flex items-center gap-1"
            >
              {preset === "reset" && <RotateCcw className="w-3 h-3 text-cyan-400" />}
              {CAMERA_PRESETS[preset].label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-[#030914] border border-cyan-500/20">
          <label
            htmlFor="viz-intensity-slider"
            className="text-[10px] font-mono uppercase tracking-wider text-slate-400 whitespace-nowrap"
          >
            Intensity
          </label>
          <input
            id="viz-intensity-slider"
            type="range"
            min={0.2}
            max={1.8}
            step={0.05}
            value={state.visualizationIntensity}
            onChange={(e) => onChangeIntensity(Number(e.target.value))}
            className="w-16 lg:w-20 accent-cyan-400 cursor-pointer"
          />
          <span className="text-[11px] font-mono tabular-nums text-cyan-300 w-9 text-right">
            {state.visualizationIntensity.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Right: Animation Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="hidden xl:inline text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400 mr-1">
          Motion
        </span>
        {(
          [
            ["playing", "Play", Play],
            ["paused", "Pause", Pause],
            ["disabled", "Off", Square],
          ] as [AnimationMode, string, typeof Play][]
        ).map(([modeId, label, Icon]) => {
          const active = state.animationMode === modeId;
          return (
            <button
              key={modeId}
              type="button"
              data-testid={`anim-${modeId}`}
              onClick={() => onChangeAnimationMode(modeId)}
              aria-pressed={active}
              className={`px-2 py-1 border text-[10px] font-mono uppercase flex items-center gap-1 transition-colors ${
                active
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-100"
                  : "bg-[#030914] border-cyan-500/20 text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          );
        })}
      </div>
    </footer>
  );
}
