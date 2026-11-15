import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, PanelLeft, PanelRight, RotateCcw } from "lucide-react";
import type {
  AnatomyId,
  AnimationMode,
  BodySystemId,
  CameraPresetId,
  VisualizationMode,
} from "./data/anatomyCatalog.ts";
import type { SuitComponentId, SuitSubsystemId } from "./data/spacesuitCatalog.ts";
import {
  buildTelemetrySnapshot,
  type SuitAlert,
  type SuitScenarioId,
  type SuitTelemetrySnapshot,
} from "./utils/telemetryEngine.ts";
import {
  createInitialSimulationState,
  restoreCompleteBody,
  selectOrgan,
  selectSuitComponent,
  setAnimationMode,
  setBodySystemFilter,
  setExplodeProgress,
  setMonitoringDashboardOpen,
  setSuitScenario,
  setSuitSubsystemFilter,
  setThermalIntensity,
  setVisualizationIntensity,
  setVisualizationMode,
  toggleIsolateOrgan,
  toggleSuitMode,
  type DisplaySettings,
  type SimulationState,
} from "./utils/simulationState.ts";
import { AnatomyViewport, type AnatomyViewportHandle } from "./components/AnatomyViewport.tsx";
import { LeftControlPanel } from "./components/LeftControlPanel.tsx";
import { RightInspectorPanel } from "./components/RightInspectorPanel.tsx";
import { BottomControlBar } from "./components/BottomControlBar.tsx";
import { SpacesuitTelemetryModal } from "./components/SpacesuitTelemetryModal.tsx";
import { SentinelProvider } from "./sentinel/api.tsx";
import { MissionBar } from "./sentinel/MissionBar.tsx";
import { SafeBoundary } from "./sentinel/SafeBoundary.tsx";
import {
  EMERGENCY_BY_ID,
  EMERGENCY_CATEGORY_BY_ID,
  categoryForOrgan,
  type EmergencyCategoryId,
  type EmergencyScenario,
} from "./data/emergencyScenarios.ts";
import {
  activateScenario,
  advanceTimeline,
  createInitialEmergencyState,
  displayedLevel,
  previewScenario,
  selectEmergencyCategory,
  setEmergencyModeOpen,
  setEmergencyPaused,
  setEmergencyStage,
  setEmergencyView,
  stepEmergencyStage,
  stopEmergency,
  timelineFinished,
  type EmergencyState,
  type EmergencyView,
} from "./utils/emergencyState.ts";
import type { EmergencyVisualState } from "./three/emergencyEngine.ts";
import { EmergencyLeftPanel } from "./components/emergency/EmergencyLeftPanel.tsx";
import { EmergencyRightPanel } from "./components/emergency/EmergencyRightPanel.tsx";
import { EmergencyTimelineBar } from "./components/emergency/EmergencyTimelineBar.tsx";

export default function App() {
  const [state, setState] = useState<SimulationState>(() => createInitialSimulationState());
  const [telemetrySnapshot, setTelemetrySnapshot] = useState<SuitTelemetrySnapshot>(() =>
    buildTelemetrySnapshot("nominal", 0),
  );
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [externalPrompt, setExternalPrompt] = useState<{ id: number; text: string } | null>(null);
  const viewportRef = useRef<AnatomyViewportHandle | null>(null);
  const telemetryPhaseRef = useRef(0);
  const [emergency, setEmergency] = useState<EmergencyState>(() => createInitialEmergencyState());
  const emergencyOpenRef = useRef(false);
  emergencyOpenRef.current = emergency.modeOpen;
  const pickedMeshRef = useRef<string | null>(null);
  const suitLinkedRef = useRef(false);
  const suitScenarioRef = useRef(state.suitScenarioId);
  suitScenarioRef.current = state.suitScenarioId;

  // Sync live simulated telemetry when scenario changes or simulation ticks
  useEffect(() => {
    setTelemetrySnapshot(buildTelemetrySnapshot(state.suitScenarioId, telemetryPhaseRef.current));
  }, [state.suitScenarioId]);

  useEffect(() => {
    if (!state.suitActive || state.animationMode !== "playing") return;
    const id = window.setInterval(() => {
      telemetryPhaseRef.current += 1.25;
      setTelemetrySnapshot(
        buildTelemetrySnapshot(state.suitScenarioId, telemetryPhaseRef.current),
      );
    }, 1250);
    return () => window.clearInterval(id);
  }, [state.suitActive, state.suitScenarioId, state.animationMode]);

  const handleSelectOrgan = useCallback((id: AnatomyId | null, focusZoom = true) => {
    setState((prev) => selectOrgan(prev, id));
    if (id) setRightOpen(true); // on narrow screens the inspector is a drawer: open it with the selection
    if (id && focusZoom) {
      viewportRef.current?.focusOnOrgan(id, false);
    } else if (!id) {
      viewportRef.current?.focusCameraPreset("reset");
    }
  }, []);

  const handleSelectSuitComponent = useCallback(
    (id: SuitComponentId | null, focusZoom = true, openHud = false) => {
      setState((prev) => {
        let next = selectSuitComponent(prev, id);
        if (openHud) {
          next = setMonitoringDashboardOpen(next, true);
        }
        return next;
      });
      if (id) setRightOpen(true);
      if (id && focusZoom) {
        viewportRef.current?.focusOnSuitComponent(id, false);
      } else if (!id) {
        viewportRef.current?.focusCameraPreset("reset");
      }
    },
    [],
  );

  const handleToggleSuitMode = useCallback((active: boolean) => {
    setState((prev) => toggleSuitMode(prev, active));
  }, []);

  const handleSelectMode = useCallback((mode: VisualizationMode) => {
    setState((prev) => {
      let next = setVisualizationMode(prev, mode);
      if (mode === "ai_monitoring") {
        next = setMonitoringDashboardOpen(next, true);
      }
      return next;
    });
  }, []);

  const handleSelectSystem = useCallback((sys: BodySystemId) => {
    setState((prev) => setBodySystemFilter(prev, sys));
  }, []);

  const handleSelectSuitSubsystem = useCallback((sub: SuitSubsystemId) => {
    setState((prev) => setSuitSubsystemFilter(prev, sub));
  }, []);

  const handleToggleIsolate = useCallback(() => {
    setState((prev) => toggleIsolateOrgan(prev));
  }, []);

  const handleRestoreBody = useCallback(() => {
    setState((prev) => restoreCompleteBody(prev));
    viewportRef.current?.focusCameraPreset("reset");
  }, []);

  const handleChangeExplodeProgress = useCallback((val: number) => {
    setState((prev) => setExplodeProgress(prev, val));
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

  const handleSelectScenario = useCallback((scenarioId: SuitScenarioId) => {
    setState((prev) => setSuitScenario(prev, scenarioId));
  }, []);

  const handleOpenMonitoringHud = useCallback(() => {
    setState((prev) => setMonitoringDashboardOpen(prev, true));
  }, []);

  const handleCloseMonitoringHud = useCallback(() => {
    setState((prev) => setMonitoringDashboardOpen(prev, false));
  }, []);

  const handleInspectAlertComponent = useCallback((id: SuitComponentId) => {
    setState((prev) => {
      let next = setMonitoringDashboardOpen(prev, false);
      next = selectSuitComponent(next, id);
      return next;
    });
    viewportRef.current?.focusOnSuitComponent(id, true);
  }, []);

  const handleAskAiAlert = useCallback((alert: SuitAlert) => {
    setState((prev) => {
      let next = setMonitoringDashboardOpen(prev, false);
      next = selectSuitComponent(next, alert.componentId);
      return next;
    });
    setExternalPrompt({
      id: Date.now(),
      text: `Why did "${alert.title}" trigger and how does it affect ${alert.componentName}?`,
    });
    setRightOpen(true);
  }, []);

  /* ---------------- Spaceflight Emergency Simulation (third interaction mode) ---------------- */

  const handleToggleEmergency = useCallback((open: boolean) => {
    setEmergency((prev) => setEmergencyModeOpen(prev, open));
  }, []);

  // Clicking the body in Emergency mode opens that organ's scenario directory.
  const handleViewportSelectOrgan = useCallback(
    (id: AnatomyId | null, focusZoom: boolean) => {
      handleSelectOrgan(id, focusZoom);
      if (emergencyOpenRef.current && id) {
        const cat = categoryForOrgan(id, pickedMeshRef.current);
        if (cat) setEmergency((prev) => selectEmergencyCategory(prev, cat));
      }
      pickedMeshRef.current = null;
    },
    [handleSelectOrgan],
  );

  const handleEmergencySelectCategory = useCallback((id: EmergencyCategoryId) => {
    setEmergency((prev) => selectEmergencyCategory(prev, id));
  }, []);

  const handlePreviewScenario = useCallback((id: string) => {
    setEmergency((prev) => {
      const s = EMERGENCY_BY_ID[id];
      if (!s) return prev;
      const next = previewScenario(prev, id);
      // Keep the open directory if it lists this scenario (SANS appears under Neuro and Eyes).
      const listed = EMERGENCY_CATEGORY_BY_ID[next.categoryId].scenarioIds.includes(id);
      return listed ? next : selectEmergencyCategory(next, s.category);
    });
    setRightOpen(true);
  }, []);

  const focusScenario = useCallback((s: EmergencyScenario) => {
    if (viewportRef.current?.focusOnEmergency()) return;
    if (s.fx.primary) viewportRef.current?.focusOnOrgan(s.fx.primary, false);
    else viewportRef.current?.focusCameraPreset("reset");
  }, []);

  const handleActivateScenario = useCallback((id: string) => {
    if (!EMERGENCY_BY_ID[id]) return;
    setEmergency((prev) => activateScenario(prev, id, Date.now(), suitScenarioRef.current));
  }, []);

  // Frame the affected region once the 3D engine has the scenario (child effects run first).
  useEffect(() => {
    const s = emergency.activeScenarioId ? EMERGENCY_BY_ID[emergency.activeScenarioId] : null;
    if (s) focusScenario(s);
  }, [emergency.activeScenarioId, focusScenario]);

  const handleStopEmergency = useCallback(() => {
    setEmergency((prev) => stopEmergency(prev));
  }, []);

  const handleIsolateScenario = useCallback((s: EmergencyScenario) => {
    const primary = s.fx.primary;
    if (!primary) return;
    setState((prev) => ({ ...selectOrgan(prev, primary), isolated: true }));
    viewportRef.current?.focusOnOrgan(primary, true);
  }, []);

  const handleEmergencyFullBody = useCallback(() => {
    setState((prev) => restoreCompleteBody(selectOrgan(prev, null)));
    viewportRef.current?.focusCameraPreset("reset");
  }, []);

  // Timeline: auto-advance one illustrative stage at a time until the last stage.
  useEffect(() => {
    if (!emergency.activeScenarioId || emergency.paused || timelineFinished(emergency)) return;
    const id = window.setTimeout(() => setEmergency((prev) => advanceTimeline(prev)), 3800);
    return () => window.clearTimeout(id);
  }, [emergency]);

  // Astronaut mode: respiratory emergencies drive the existing suit AI-monitoring telemetry.
  useEffect(() => {
    const s = emergency.activeScenarioId ? EMERGENCY_BY_ID[emergency.activeScenarioId] : null;
    const linked = s?.suitScenario ?? null;
    if (linked && state.suitActive) {
      if (state.suitScenarioId !== linked) {
        suitLinkedRef.current = true;
        setState((prev) => setSuitScenario(prev, linked));
      }
    } else if (!linked && suitLinkedRef.current) {
      suitLinkedRef.current = false;
      const restore = emergency.suitScenarioBefore ?? "nominal";
      setState((prev) => setSuitScenario(prev, restore));
    }
  }, [emergency.activeScenarioId, emergency.suitScenarioBefore, state.suitActive, state.suitScenarioId]);

  const emergencyVisual = useMemo<EmergencyVisualState | null>(() => {
    if (!emergency.modeOpen) return null;
    const id = emergency.activeScenarioId ?? emergency.selectedScenarioId;
    const scenario = id ? EMERGENCY_BY_ID[id] : null;
    if (!scenario) return null;
    return {
      scenario,
      level: displayedLevel(emergency),
      preview: !emergency.activeScenarioId,
      view: emergency.view,
      paused: emergency.paused,
    };
  }, [emergency]);

  const emergencyHud = useMemo(() => {
    if (!emergency.modeOpen) return null;
    const s = emergency.activeScenarioId ? EMERGENCY_BY_ID[emergency.activeScenarioId] : null;
    if (!s) return { name: "", level: 0, stageLabel: "", view: emergency.view, active: false };
    const level = displayedLevel(emergency);
    return {
      name: s.name,
      level,
      stageLabel: s.stages[Math.min(emergency.stage, s.stages.length - 1)],
      view: emergency.view,
      active: true,
    };
  }, [emergency]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "Escape") {
        setState((prev) => {
          if (prev.monitoringDashboardOpen) {
            return setMonitoringDashboardOpen(prev, false);
          }
          const clearedOrgan = selectOrgan(prev, null);
          return selectSuitComponent(clearedOrgan, null);
        });
        viewportRef.current?.focusCameraPreset("reset");
      } else if (e.key === "r" || e.key === "R") {
        viewportRef.current?.focusCameraPreset("reset");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SentinelProvider>
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
            <span
              className={`hidden sm:inline text-[10px] font-mono uppercase tracking-[0.14em] truncate ${
                emergency.modeOpen ? "text-rose-300" : "text-cyan-400"
              }`}
            >
              {emergency.modeOpen
                ? `Spaceflight Emergency Simulation${state.suitActive ? " · Astronaut Mode" : ""}`
                : state.suitActive
                  ? "AI Anatomy & Smart EVA Spacesuit Platform"
                  : "3D Medical Anatomy Simulation"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden lg:inline text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
            Non-Diagnostic Visualization Layer
          </span>

          {state.suitActive && (
            <button
              type="button"
              onClick={handleOpenMonitoringHud}
              className="hidden sm:flex px-2.5 py-1 bg-violet-500/20 border border-violet-400/60 text-[11px] font-mono uppercase text-violet-100 hover:bg-violet-500/30 items-center gap-1"
            >
              <Activity className="w-3 h-3" />
              AI Telemetry
            </button>
          )}

          {(state.isolated || state.explodeProgress > 0) && (
            <button
              type="button"
              onClick={handleRestoreBody}
              className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-400 text-[11px] font-mono uppercase text-cyan-100 hover:bg-cyan-500/30 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              {state.suitActive ? "Restore Suit" : "Restore Body"}
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

      <SafeBoundary label="Mission bar">
        <MissionBar
          onOpenOrgan={(id) => {
            handleSelectOrgan(id, true);
            setRightOpen(true);
          }}
        />
      </SafeBoundary>

      {/* Main 3-Column Medical & Astronaut Spacesuit Simulation Workspace */}
      <main className="flex-1 min-h-0 flex relative overflow-hidden">
        {emergency.modeOpen ? (
          <EmergencyLeftPanel
            emergency={emergency}
            isOpen={leftOpen}
            onCloseMobile={() => setLeftOpen(false)}
            onSelectCategory={handleEmergencySelectCategory}
            onPreviewScenario={(id) => {
              handlePreviewScenario(id);
              setLeftOpen(false);
            }}
          />
        ) : (
        <LeftControlPanel
          state={state}
          isOpen={leftOpen}
          onCloseMobile={() => setLeftOpen(false)}
          onSelectMode={handleSelectMode}
          onSelectSystem={handleSelectSystem}
          onSelectSuitSubsystem={handleSelectSuitSubsystem}
          onSelectOrgan={(id) => {
            handleSelectOrgan(id, true);
            setLeftOpen(false);
          }}
          onSelectSuitComponent={(id) => {
            handleSelectSuitComponent(id, true, false);
            setLeftOpen(false);
          }}
          onChangeThermalIntensity={handleChangeThermalIntensity}
          onToggleDisplay={handleToggleDisplay}
        />
        )}

        <AnatomyViewport
          ref={viewportRef}
          state={state}
          telemetrySnapshot={telemetrySnapshot}
          onSelectOrgan={handleViewportSelectOrgan}
          onSelectSuitComponent={handleSelectSuitComponent}
          onToggleSuitMode={handleToggleSuitMode}
          onChangeExplodeProgress={handleChangeExplodeProgress}
          onRestoreSuit={handleRestoreBody}
          onOpenTelemetryHud={handleOpenMonitoringHud}
          emergencyOpen={emergency.modeOpen}
          onToggleEmergency={handleToggleEmergency}
          emergencyVisual={emergencyVisual}
          emergencyHud={emergencyHud}
          onPickMesh={(name) => {
            pickedMeshRef.current = name;
          }}
        />

        {emergency.modeOpen ? (
          <EmergencyRightPanel
            emergency={emergency}
            suitActive={state.suitActive}
            isOpen={rightOpen}
            onCloseMobile={() => setRightOpen(false)}
            onActivate={handleActivateScenario}
            onStop={handleStopEmergency}
            onFocus={focusScenario}
            onIsolate={handleIsolateScenario}
            onPreviewScenario={handlePreviewScenario}
          />
        ) : (
        <RightInspectorPanel
          state={state}
          telemetrySnapshot={telemetrySnapshot}
          isOpen={rightOpen}
          externalPrompt={externalPrompt}
          onCloseMobile={() => setRightOpen(false)}
          onSelectOrgan={(id) => handleSelectOrgan(id, true)}
          onSelectSuitComponent={(id) => handleSelectSuitComponent(id, true, false)}
          onToggleIsolate={handleToggleIsolate}
          onRestoreBody={handleRestoreBody}
          onFocusOrgan={(id) => viewportRef.current?.focusOnOrgan(id, true)}
          onFocusSuitComponent={(id) => viewportRef.current?.focusOnSuitComponent(id, true)}
          onOpenMonitoringHud={handleOpenMonitoringHud}
        />
        )}
      </main>

      {emergency.modeOpen ? (
        <EmergencyTimelineBar
          emergency={emergency}
          suitActive={state.suitActive}
          isolated={state.isolated}
          onSetStage={(s) => setEmergency((prev) => setEmergencyStage(prev, s))}
          onStep={(d) => setEmergency((prev) => stepEmergencyStage(prev, d))}
          onTogglePause={() => setEmergency((prev) => setEmergencyPaused(prev, !prev.paused))}
          onReset={handleStopEmergency}
          onView={(v: EmergencyView) => setEmergency((prev) => setEmergencyView(prev, v))}
          onIsolate={() => {
            const s = emergency.activeScenarioId ? EMERGENCY_BY_ID[emergency.activeScenarioId] : null;
            if (s) handleIsolateScenario(s);
          }}
          onFullBody={handleEmergencyFullBody}
          onToggleSuit={handleToggleSuitMode}
          onCameraPreset={handleCameraPreset}
        />
      ) : (
        <BottomControlBar
          state={state}
          telemetrySnapshot={telemetrySnapshot}
          onCameraPreset={handleCameraPreset}
          onChangeIntensity={handleChangeIntensity}
          onChangeAnimationMode={handleChangeAnimationMode}
          onOpenTelemetryHud={handleOpenMonitoringHud}
        />
      )}

      <SpacesuitTelemetryModal
        isOpen={state.monitoringDashboardOpen}
        snapshot={telemetrySnapshot}
        scenarioId={state.suitScenarioId}
        onClose={handleCloseMonitoringHud}
        onSelectScenario={handleSelectScenario}
        onInspectComponent={handleInspectAlertComponent}
        onAskAiAlert={handleAskAiAlert}
      />
    </div>
    </SentinelProvider>
  );
}
