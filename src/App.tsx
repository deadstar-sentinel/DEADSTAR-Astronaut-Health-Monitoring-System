import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, PanelLeft, PanelRight, Play, RotateCcw, SquareTerminal, Volume2, VolumeX } from "lucide-react";
import { CommandConsole, type ConsoleLine } from "./components/CommandConsole.tsx";
import { DemoOverlay, type DemoState } from "./components/DemoOverlay.tsx";
import { HELP_LINES, parseCommand } from "./utils/commandParser.ts";
import { setSoundEnabled, sfx, soundEnabled } from "./utils/sound.ts";
import { prefetch, speak, stopSpeaking, unlockAudio } from "./utils/narrator.ts";
import { TOUR, readMs, type Audience, type TourAction } from "./data/tourScript.ts";
import { ANATOMY_BY_ID, VISUALIZATION_MODES } from "./data/anatomyCatalog.ts";
import { SEVERITY_META, severityHex } from "./data/emergencyScenarios.ts";
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
    // Phones and tablets: the scenario card is a drawer over the body, so get it out of the way.
    if (window.innerWidth < 1024) setRightOpen(false);
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

  /* ---------------- Command console, guided demo tour, soundscape ---------------- */

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(soundEnabled);
  const [demo, setDemo] = useState<DemoState | null>(null);
  const demoTimers = useRef<number[]>([]);
  const emergencyRef = useRef(emergency);
  emergencyRef.current = emergency;
  const stateRef = useRef(state);
  stateRef.current = state;

  const simulate = useCallback((id: string, severity: number | null) => {
    setEmergency((prev) => {
      let next = setEmergencyModeOpen(prev, true);
      next = activateScenario(previewScenario(next, id), id, Date.now(), suitScenarioRef.current);
      return severity === null ? next : setEmergencyStage(next, severity);
    });
    setRightOpen(true);
  }, []);

  const runCommand = useCallback(
    (text: string): ConsoleLine[] => {
      const a = parseCommand(text);
      const em = emergencyRef.current;
      const active = em.activeScenarioId ? EMERGENCY_BY_ID[em.activeScenarioId] : null;
      switch (a.kind) {
        case "help":
          return HELP_LINES.map(([c, d]) => ({ kind: "info" as const, text: `${c.padEnd(40)} ${d}` }));
        case "status": {
          const st = stateRef.current;
          const lines: ConsoleLine[] = [
            { kind: "info", text: `Twin: ${st.suitActive ? "astronaut spacesuit" : "normal human"} · mode ${st.mode} · selected ${st.selectedOrganId ?? "none"}${st.isolated ? " (isolated)" : ""}` },
          ];
          if (active) {
            lines.push({
              kind: em.stage >= 3 ? "warn" : "ok",
              text: `Emergency: ${active.name} · L${em.stage} ${SEVERITY_META[em.stage].label} · ${active.stages[Math.min(em.stage, active.stages.length - 1)]}${em.paused ? " · PAUSED" : ""} · view ${em.view}`,
            });
          } else lines.push({ kind: "info", text: em.modeOpen ? "Emergency mode open, no scenario running." : "No emergency running." });
          lines.push({ kind: "info", text: "All values are simulated demonstration data." });
          return lines;
        }
        case "clear":
          return [];
        case "demo":
          window.setTimeout(() => startDemoRef.current(), 50);
          return [{ kind: "ok", text: "Starting the guided tour. Click anywhere to take control." }];
        case "scan":
          handleViewportSelectOrgan(a.organ, true);
          return [{ kind: "ok", text: `Focusing ${ANATOMY_BY_ID[a.organ].name}.` }];
        case "isolate":
          setState((prev) => ({ ...selectOrgan(prev, a.organ), isolated: true }));
          viewportRef.current?.focusOnOrgan(a.organ, true);
          return [{ kind: "ok", text: `Isolating ${ANATOMY_BY_ID[a.organ].name}. Type RESET VIEW or press Esc to restore.` }];
        case "simulate": {
          const s = EMERGENCY_BY_ID[a.scenarioId];
          simulate(a.scenarioId, a.severity);
          return [
            { kind: "ok", text: `Simulating ${s.name}${a.severity !== null ? ` at L${a.severity}` : ""}.` },
            { kind: "info", text: s.mechanism },
            { kind: "info", text: `Evidence: ${s.evidence === "documented" ? "documented spaceflight risk" : s.evidence === "associated" ? "spaceflight-associated change" : s.evidence === "general" ? "general medical emergency" : "hypothetical teaching case"}.` },
          ];
        }
        case "severity":
          if (!active) return [{ kind: "warn", text: "No emergency running. Try SIMULATE HYPOXIA first." }];
          setEmergency((prev) => setEmergencyStage(prev, a.level));
          return [{ kind: "ok", text: `Severity set to L${Math.min(a.level, active.stages.length - 1)}.` }];
        case "step":
          if (!active) return [{ kind: "warn", text: "No emergency running." }];
          setEmergency((prev) => stepEmergencyStage(prev, a.delta));
          return [{ kind: "ok", text: a.delta > 0 ? "Escalating one stage." : "De-escalating one stage." }];
        case "reset":
          if (!active) {
            setState((prev) => restoreCompleteBody(selectOrgan(prev, null)));
            viewportRef.current?.focusCameraPreset("reset");
            return [{ kind: "ok", text: "View reset to the full body." }];
          }
          setEmergency((prev) => stopEmergency(prev));
          return [{ kind: "ok", text: `${active.name} reset. Anatomy recovering to normal.` }];
        case "pause":
          setEmergency((prev) => setEmergencyPaused(prev, a.paused));
          return [{ kind: "ok", text: a.paused ? "Simulation paused." : "Simulation resumed." }];
        case "view":
          setEmergency((prev) => setEmergencyView(prev, a.view));
          return [{ kind: "ok", text: `View: ${a.view}.` }];
        case "suit":
          handleToggleSuitMode(a.on);
          return [{ kind: "ok", text: a.on ? "Astronaut spacesuit on." : "Normal human anatomy." }];
        case "mode":
          handleSelectMode(a.mode);
          return [{ kind: "ok", text: `Mode: ${VISUALIZATION_MODES.find((m) => m.id === a.mode)?.label ?? a.mode}.` }];
        case "emergency":
          handleToggleEmergency(a.on);
          return [{ kind: "ok", text: a.on ? "Emergency simulation mode open." : "Emergency simulation mode closed." }];
        default:
          return [
            { kind: "err", text: `Not understood: "${a.text}". Type HELP for commands.` },
            ...(a.suggestion ? [{ kind: "info" as const, text: `Did you mean: SIMULATE ${a.suggestion.toUpperCase()}` }] : []),
          ];
      }
    },
    [handleViewportSelectOrgan, handleToggleSuitMode, handleSelectMode, handleToggleEmergency, simulate],
  );

  // Console scope and one-click commands follow the current selection.
  const consoleScope = useMemo(() => {
    const active = emergency.activeScenarioId ? EMERGENCY_BY_ID[emergency.activeScenarioId] : null;
    if (active) return `EMERGENCY · ${active.category.toUpperCase()}`;
    const o = state.selectedOrganId;
    if (o === "brain" || o === "nervous") return "NEURO-CRANIAL";
    if (o === "heart" || o === "circulatory" || o === "lungs") return "CARDIOPULMONARY";
    if (o === "skeletal" || o === "spine" || o === "muscular") return "MUSCULOSKELETAL";
    if (o) return ANATOMY_BY_ID[o].name.toUpperCase();
    return state.suitActive ? "EVA SUIT" : "FULL BODY";
  }, [emergency.activeScenarioId, state.selectedOrganId, state.suitActive]);

  const consoleChips = useMemo(() => {
    if (emergency.activeScenarioId) return ["STATUS", "UP", "DOWN", "VIEW COMPARE", "PAUSE", "RESET"];
    const o = state.selectedOrganId;
    if (o === "brain" || o === "nervous") return ["SIMULATE SANS --severity=3", "SIMULATE VESTIBULAR", "SIMULATE HYPOXIA --severity=4"];
    if (o === "heart" || o === "circulatory") return ["SIMULATE CLOT --severity=3", "SIMULATE ARRHYTHMIA", "SIMULATE HEART ATTACK"];
    if (o === "lungs") return ["SIMULATE HYPERCAPNIA --severity=4", "SIMULATE HYPOXIA --severity=3", "SIMULATE SCRUBBER FAILURE"];
    if (o === "skeletal" || o === "spine") return ["SIMULATE BONE LOSS --severity=3", "SIMULATE FRACTURE --severity=4"];
    if (o === "muscular") return ["SIMULATE ATROPHY --severity=3", "SIMULATE MUSCLE INJURY"];
    if (o === "kidneys") return ["SIMULATE KIDNEY STONE --severity=4", "SIMULATE DEHYDRATION"];
    return ["HELP", "STATUS", "SIMULATE CLOT --severity=3", "SIMULATE HYPERCAPNIA --severity=4", "SCAN BRAIN", "DEMO"];
  }, [emergency.activeScenarioId, state.selectedOrganId]);

  const consoleAccent = emergency.activeScenarioId
    ? severityHex(displayedLevel(emergency))
    : state.selectedOrganId === "brain" || state.selectedOrganId === "nervous"
      ? "#7B61FF"
      : state.selectedOrganId === "heart" || state.selectedOrganId === "lungs" || state.selectedOrganId === "circulatory"
        ? "#00E599"
        : "#00E5FF";

  // Narrated cinematic walkthrough. Each shot runs a real app action, flies the camera,
  // and waits for its narration (or a reading-time hold). Any touch, click or key takes control.
  const [audience, setAudience] = useState<Audience>(() => {
    try {
      return localStorage.getItem("lifeline-audience") === "expert" ? "expert" : "simple";
    } catch {
      return "simple";
    }
  });
  const audienceRef = useRef(audience);
  audienceRef.current = audience;
  const [narrate, setNarrate] = useState(true);
  const narrateRef = useRef(narrate);
  narrateRef.current = narrate;
  const demoRun = useRef(0);

  const setAudiencePersist = useCallback((a: Audience) => {
    setAudience(a);
    try {
      localStorage.setItem("lifeline-audience", a);
    } catch {
      /* private mode */
    }
  }, []);

  const stopDemo = useCallback(() => {
    demoRun.current += 1;
    for (const t of demoTimers.current) window.clearTimeout(t);
    demoTimers.current = [];
    stopSpeaking();
    viewportRef.current?.endCinematic();
    setDemo(null);
  }, []);

  const runTourAction = useCallback(
    (a: TourAction) => {
      const narrow = window.innerWidth < 1024;
      switch (a) {
        case "reset":
          setConsoleOpen(false);
          setLeftOpen(false);
          setRightOpen(false);
          setEmergency((prev) => setEmergencyModeOpen(prev, false));
          setState((prev) => restoreCompleteBody(selectOrgan(setVisualizationMode(toggleSuitMode(prev, false), "holographic"), null)));
          break;
        case "chest":
          break;
        case "xray_head":
          setState((prev) => setVisualizationMode(prev, "xray"));
          break;
        case "co2_l1":
          setState((prev) => setVisualizationMode(prev, "holographic"));
          simulate("co2_scrubber_failure", 1);
          if (narrow) setRightOpen(false);
          break;
        case "co2_l4":
          setEmergency((prev) => setEmergencyStage(prev, 4));
          break;
        case "suit_on":
          handleToggleSuitMode(true);
          break;
        case "countermeasure":
          setEmergency((prev) => stopEmergency(prev));
          break;
        case "clot":
          handleToggleSuitMode(false);
          simulate("venous_thrombosis", 3);
          if (narrow) setRightOpen(false);
          break;
        case "finish":
          setEmergency((prev) => setEmergencyModeOpen(prev, false));
          setState((prev) => selectOrgan(prev, null));
          break;
      }
    },
    [simulate, handleToggleSuitMode],
  );

  const startDemo = useCallback(() => {
    stopDemo();
    unlockAudio();
    const run = demoRun.current;
    const alive = () => run === demoRun.current;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        demoTimers.current.push(window.setTimeout(resolve, ms));
      });
    void (async () => {
      for (let i = 0; i < TOUR.length; i++) {
        if (!alive()) return;
        const s = TOUR[i];
        const text = audienceRef.current === "expert" ? s.expert : s.simple;
        runTourAction(s.action);
        const hold = Math.max(s.minMs, readMs(text));
        setDemo({ step: i + 1, total: TOUR.length, title: s.title, caption: text, ms: hold, audience: audienceRef.current, voice: narrateRef.current });
        await wait(s.shotDelay ?? 120);
        if (!alive()) return;
        viewportRef.current?.cinematic(s.shot);
        const nextShot = TOUR[i + 1];
        if (nextShot && narrateRef.current) prefetch(audienceRef.current === "expert" ? nextShot.expert : nextShot.simple);
        const t0 = Date.now();
        if (narrateRef.current) await speak(text);
        else await wait(hold);
        if (!alive()) return;
        const rest = s.minMs - (Date.now() - t0);
        if (rest > 0) await wait(rest);
      }
      if (!alive()) return;
      viewportRef.current?.endCinematic();
      setDemo(null);
    })();
  }, [stopDemo, runTourAction]);
  const startDemoRef = useRef(startDemo);
  startDemoRef.current = startDemo;

  // A real click, key or scroll anywhere outside the caption hands control back to the judge.
  useEffect(() => {
    if (!demo) return;
    const interrupt = (e: Event) => {
      if (!e.isTrusted) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-demo-overlay]")) return;
      stopDemo();
    };
    window.addEventListener("pointerdown", interrupt, true);
    window.addEventListener("keydown", interrupt, true);
    window.addEventListener("wheel", interrupt, true);
    return () => {
      window.removeEventListener("pointerdown", interrupt, true);
      window.removeEventListener("keydown", interrupt, true);
      window.removeEventListener("wheel", interrupt, true);
    };
  }, [demo, stopDemo]);

  useEffect(() => () => stopDemo(), [stopDemo]);

  // /twin#demo (or ?demo) starts the tour on its own once the twin has had time to load.
  useEffect(() => {
    if (!/demo/.test(window.location.hash + window.location.search)) return;
    const id = window.setTimeout(() => startDemoRef.current(), 3500);
    return () => window.clearTimeout(id);
  }, []);

  // Sound cues follow the simulation; button ticks are global.
  const prevStage = useRef<{ id: string | null; stage: number }>({ id: null, stage: 0 });
  useEffect(() => {
    const prev = prevStage.current;
    const id = emergency.activeScenarioId;
    if (id && (id !== prev.id || emergency.stage !== prev.stage)) {
      if (emergency.stage >= 4) sfx.critical();
      else if (emergency.stage >= 3) sfx.warn();
      else sfx.ping();
    } else if (!id && prev.id) sfx.recover();
    prevStage.current = { id, stage: emergency.stage };
  }, [emergency.activeScenarioId, emergency.stage]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("button")) sfx.click();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      setSoundEnabled(!on);
      return !on;
    });
  }, []);

  // ` toggles the console (ignored while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "`" || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t.id !== "lifeline-console-input")) return;
      e.preventDefault();
      setConsoleOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
              <span className="max-sm:hidden">DEADSTAR </span>LIFELINE
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
          <span className="hidden 2xl:inline text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
            Non-Diagnostic Visualization Layer
          </span>

          <button
            type="button"
            data-testid="demo-btn"
            onClick={() => (demo ? stopDemo() : startDemo())}
            title="Self-playing 55-second tour. Click anywhere to take control."
            className={`px-2.5 py-1 border text-[11px] font-mono uppercase flex items-center gap-1 ${
              demo ? "bg-rose-500/20 border-rose-300 text-white" : "bg-cyan-500/15 border-cyan-300/70 text-cyan-50 hover:bg-cyan-500/25"
            }`}
          >
            <Play className="w-3 h-3" />
            {demo ? "Stop tour" : "Demo tour"}
          </button>
          <div className="flex items-center border border-cyan-500/30" role="group" aria-label="Explanation level">
            {(["simple", "expert"] as Audience[]).map((a) => (
              <button
                key={a}
                type="button"
                data-testid={`audience-${a}`}
                onClick={() => setAudiencePersist(a)}
                aria-pressed={audience === a}
                title={a === "simple" ? "Plain-language explanations for everyone" : "Full clinical detail for experts"}
                className={`px-2 py-1 text-[10px] font-mono uppercase ${audience === a ? "bg-cyan-500/25 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {a === "simple" ? "Simple" : "Expert"}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="console-btn"
            onClick={() => setConsoleOpen((o) => !o)}
            aria-pressed={consoleOpen}
            title="Command console (` key)"
            className="px-2 py-1 border border-cyan-500/30 text-[11px] font-mono uppercase text-cyan-100 hover:border-cyan-300 flex items-center gap-1"
          >
            <SquareTerminal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Console</span>
          </button>
          <button
            type="button"
            data-testid="sound-btn"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Mute interface sounds" : "Turn on interface sounds"}
            title={soundOn ? "Sound on" : "Sound off"}
            className="p-1.5 border border-cyan-500/30 text-cyan-100 hover:border-cyan-300"
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
          </button>

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

        <CommandConsole
          open={consoleOpen}
          onClose={() => setConsoleOpen(false)}
          onRun={runCommand}
          scope={consoleScope}
          chips={consoleChips}
          accent={consoleAccent}
        />
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

      {demo && (
        <DemoOverlay
          demo={demo}
          onStop={stopDemo}
          onToggleVoice={() => {
            const next = !narrateRef.current;
            narrateRef.current = next;
            setNarrate(next);
            if (!next) stopSpeaking();
            setDemo((d) => (d ? { ...d, voice: next } : d));
          }}
        />
      )}
    </div>
    </SentinelProvider>
  );
}
