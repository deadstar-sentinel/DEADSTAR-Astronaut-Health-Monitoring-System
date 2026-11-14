import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, PanelRight, RotateCcw } from "lucide-react";
import type {
  AnatomyId,
  AnimationMode,
  BodySystemId,
  CameraPresetId,
  VisualizationMode,
} from "./data/anatomyCatalog.ts";
import {
  createInitialSimulationState,
  restoreCompleteBody,
  selectOrgan,
  setAnimationMode,
  setBodySystemFilter,
  setThermalIntensity,
  setVisualizationIntensity,
  setVisualizationMode,
  toggleIsolateOrgan,
  type DisplaySettings,
  type SimulationState,
} from "./utils/simulationState.ts";
import { AnatomyViewport, type AnatomyViewportHandle } from "./components/AnatomyViewport.tsx";
import { LeftControlPanel } from "./components/LeftControlPanel.tsx";
import { RightInspectorPanel } from "./components/RightInspectorPanel.tsx";
import { BottomControlBar } from "./components/BottomControlBar.tsx";

export default function App() {
  const [state, setState] = useState<SimulationState>(() => createInitialSimulationState());
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const viewportRef = useRef<AnatomyViewportHandle | null>(null);

  const handleSelectOrgan = useCallback((id: AnatomyId | null, focusZoom = true) => {
    setState((prev) => selectOrgan(prev, id));
    if (id && focusZoom) {
      viewportRef.current?.focusOnOrgan(id, false);
    } else if (!id) {
      viewportRef.current?.focusCameraPreset("reset");
    }
  }, []);

  const handleSelectMode = useCallback((mode: VisualizationMode) => {
    setState((prev) => setVisualizationMode(prev, mode));
  }, []);

  const handleSelectSystem = useCallback((sys: BodySystemId) => {
    setState((prev) => setBodySystemFilter(prev, sys));
  }, []);

  const handleToggleIsolate = useCallback(() => {
    setState((prev) => toggleIsolateOrgan(prev));
  }, []);

  const handleRestoreBody = useCallback(() => {
    setState((prev) => restoreCompleteBody(prev));
    viewportRef.current?.focusCameraPreset("reset");
  }, []);

  const handleCameraPreset = useCallback((preset: CameraPresetId) => {
    setState((prev) => ({ ...prev, cameraPreset: preset }));
    viewportRef.current?.focusCameraPreset(preset);
  }, []);

  const handleChangeIntensity = useCallback((val: number) => {
    setState((prev) => setVisualizationIntensity(prev, val));
  }, []);

  const handleChangeThermalIntensity = useCallback((val: number) => {
    setState((prev) => setThermalIntensity(prev, val));
  }, []);

  const handleChangeAnimationMode = useCallback((mode: AnimationMode) => {
    setState((prev) => setAnimationMode(prev, mode));
  }, []);

  const handleToggleDisplay = useCallback((key: keyof DisplaySettings) => {
    setState((prev) => ({
      ...prev,
      display: { ...prev.display, [key]: !prev.display[key] },
    }));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "Escape") {
        setState((prev) => selectOrgan(prev, null));
        viewportRef.current?.focusCameraPreset("reset");
      } else if (e.key === "r" || e.key === "R") {
        viewportRef.current?.focusCameraPreset("reset");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#030915] text-[#E6F1FF]">
      {/* Top Workstation Header Bar */}
      <header className="h-11 shrink-0 bg-[#051020] border-b border-cyan-500/20 px-3 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setLeftOpen((v) => !v)}
            aria-label="Toggle left controls drawer"
            className="lg:hidden p-1.5 border border-cyan-500/25 text-cyan-300 hover:border-cyan-300"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="text-sm font-semibold tracking-[0.16em] uppercase text-white truncate">
              DEADSTAR SENTINEL
            </h1>
            <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-400">
              3D Medical Anatomy Simulation
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden md:inline text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
            Non-Diagnostic Visualization Layer
          </span>

          {state.isolated && (
            <button
              type="button"
              onClick={handleRestoreBody}
              className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-400 text-[11px] font-mono uppercase text-cyan-100 hover:bg-cyan-500/30 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Restore Body
            </button>
          )}

          <button
            type="button"
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Toggle right inspector drawer"
            className="lg:hidden p-1.5 border border-cyan-500/25 text-cyan-300 hover:border-cyan-300"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main 3-Column Medical Simulation Workspace */}
      <main className="flex-1 min-h-0 flex relative overflow-hidden">
        <LeftControlPanel
          state={state}
          isOpen={leftOpen}
          onCloseMobile={() => setLeftOpen(false)}
          onSelectMode={handleSelectMode}
          onSelectSystem={handleSelectSystem}
          onSelectOrgan={(id) => {
            handleSelectOrgan(id, true);
            setLeftOpen(false);
          }}
          onChangeThermalIntensity={handleChangeThermalIntensity}
          onToggleDisplay={handleToggleDisplay}
        />

        <AnatomyViewport
          ref={viewportRef}
          state={state}
          onSelectOrgan={handleSelectOrgan}
        />

        <RightInspectorPanel
          state={state}
          isOpen={rightOpen}
          onCloseMobile={() => setRightOpen(false)}
          onSelectOrgan={(id) => handleSelectOrgan(id, true)}
          onToggleIsolate={handleToggleIsolate}
          onRestoreBody={handleRestoreBody}
          onFocusOrgan={(id) => viewportRef.current?.focusOnOrgan(id, true)}
        />
      </main>

      <BottomControlBar
        state={state}
        onCameraPreset={handleCameraPreset}
        onChangeIntensity={handleChangeIntensity}
        onChangeAnimationMode={handleChangeAnimationMode}
      />
    </div>
  );
}
