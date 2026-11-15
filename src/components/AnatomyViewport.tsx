import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Activity, Layers, RotateCcw, Shield, Siren, User } from "lucide-react";
import type { EmergencyVisualState } from "../three/emergencyEngine.ts";
import { SEVERITY_META, severityHex } from "../data/emergencyScenarios.ts";
import type { AnatomyId, CameraPresetId } from "../data/anatomyCatalog.ts";
import type { SuitComponentId } from "../data/spacesuitCatalog.ts";
import type { SuitTelemetrySnapshot } from "../utils/telemetryEngine.ts";
import { THERMAL_DISCLOSURE, getThermalGradientCss } from "../utils/thermalPalette.ts";
import type { SimulationState } from "../utils/simulationState.ts";
import {
  MedicalViewportController,
  type LabelProjection,
  type TelemetryReadout,
} from "../three/MedicalViewport.ts";
import { VitalsHud } from "../sentinel/VitalsHud.tsx";
import { SafeBoundary } from "../sentinel/SafeBoundary.tsx";

export interface AnatomyViewportHandle {
  focusCameraPreset: (preset: CameraPresetId) => void;
  focusOnOrgan: (organId: AnatomyId, closeZoom?: boolean) => void;
  focusOnSuitComponent: (componentId: SuitComponentId, closeZoom?: boolean) => void;
  /** Returns false when no emergency anchor is available yet. */
  focusOnEmergency: (closeZoom?: boolean) => boolean;
}

interface AnatomyViewportProps {
  state: SimulationState;
  telemetrySnapshot: SuitTelemetrySnapshot;
  onSelectOrgan: (id: AnatomyId | null, focusZoom: boolean) => void;
  onSelectSuitComponent: (
    id: SuitComponentId | null,
    focusZoom: boolean,
    openHud?: boolean,
  ) => void;
  onToggleSuitMode: (active: boolean) => void;
  onChangeExplodeProgress: (val: number) => void;
  onRestoreSuit: () => void;
  onOpenTelemetryHud: () => void;
  /** Third interaction mode: Spaceflight Emergency Simulation. */
  emergencyOpen: boolean;
  onToggleEmergency: (open: boolean) => void;
  emergencyVisual: EmergencyVisualState | null;
  emergencyHud: { name: string; level: number; stageLabel: string; view: string; active: boolean } | null;
  onPickMesh?: (meshName: string) => void;
}

export const AnatomyViewport = forwardRef<AnatomyViewportHandle, AnatomyViewportProps>(
  function AnatomyViewport(
    {
      state,
      telemetrySnapshot,
      onSelectOrgan,
      onSelectSuitComponent,
      onToggleSuitMode,
      onChangeExplodeProgress,
      onRestoreSuit,
      onOpenTelemetryHud,
      emergencyOpen,
      onToggleEmergency,
      emergencyVisual,
      emergencyHud,
      onPickMesh,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<MedicalViewportController | null>(null);
    const onSelectOrganRef = useRef(onSelectOrgan);
    onSelectOrganRef.current = onSelectOrgan;
    const onSelectSuitRef = useRef(onSelectSuitComponent);
    onSelectSuitRef.current = onSelectSuitComponent;
    const onPickMeshRef = useRef(onPickMesh);
    onPickMeshRef.current = onPickMesh;
    const [emAnchor, setEmAnchor] = useState<{ x: number; y: number; visible: boolean } | null>(null);
    const [comparePhase, setComparePhase] = useState(1);

    const initialStateRef = useRef(state);

    const [loadProgress, setLoadProgress] = useState(0);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [labels, setLabels] = useState<LabelProjection[]>([]);
    const [mriManual, setMriManual] = useState<number | null>(null);
    const [telemetry, setTelemetry] = useState<TelemetryReadout>({
      azimuthDeg: 8,
      elevationDeg: 4,
      zoomDistance: 3.56,
    });

    useImperativeHandle(
      ref,
      () => ({
        focusCameraPreset(preset) {
          controllerRef.current?.focusCameraPreset(preset);
        },
        focusOnOrgan(organId, closeZoom = false) {
          controllerRef.current?.focusOnOrgan(organId, closeZoom);
        },
        focusOnSuitComponent(componentId, closeZoom = false) {
          controllerRef.current?.focusOnSuitComponent(componentId, closeZoom);
        },
        focusOnEmergency(closeZoom = false) {
          return controllerRef.current?.focusOnEmergency(closeZoom) ?? false;
        },
      }),
      [],
    );

    useEffect(() => {
      const el = mountRef.current;
      if (!el) return;

      const ctrl = new MedicalViewportController(el, initialStateRef.current, {
        onLoadProgress: (pct) => setLoadProgress(pct),
        onReady: () => setReady(true),
        onError: (msg) => setError(msg),
        onSelectOrgan: (id, focusZoom) => onSelectOrganRef.current(id, focusZoom),
        onSelectSuitComponent: (id, focusZoom, openHud) =>
          onSelectSuitRef.current(id, focusZoom, openHud),
        onTelemetry: (t) => setTelemetry(t),
        onLabelsProject: (projected) => setLabels(projected),
        onPickMesh: (name) => onPickMeshRef.current?.(name),
        onEmergencyAnchor: (a) => setEmAnchor(a),
      });

      controllerRef.current = ctrl;
      return () => {
        ctrl.dispose();
        controllerRef.current = null;
      };
    }, []);

    useEffect(() => {
      controllerRef.current?.updateState(state);
    }, [state]);

    useEffect(() => {
      controllerRef.current?.updateTelemetrySnapshot(telemetrySnapshot);
    }, [telemetrySnapshot]);

    useEffect(() => {
      controllerRef.current?.setEmergency(emergencyVisual);
    }, [emergencyVisual]);

    // Compare view alternates normal and emergency on the same 2.4 s clock as the 3D engine.
    const comparing = emergencyHud?.active && emergencyHud.view === "compare";
    useEffect(() => {
      if (!comparing) return;
      const sync = () => setComparePhase(Math.floor(performance.now() / 2400) % 2);
      sync();
      const id = window.setInterval(sync, 200);
      return () => window.clearInterval(id);
    }, [comparing]);

    const emLevel = emergencyHud?.active ? emergencyHud.level : 0;
    const emShownLevel = comparing && comparePhase === 0 ? 0 : emLevel;
    const emColor = severityHex(emShownLevel);

    const alertBorderClass =
      state.suitActive && telemetrySnapshot.overallStatus === "critical"
        ? "border-rose-500/50"
        : state.suitActive && telemetrySnapshot.overallStatus === "warning"
          ? "border-orange-400/50"
          : "border-cyan-500/25";

    return (
      <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#030915]">
        {/* Isolated WebGL canvas mount node */}
        <div
          ref={mountRef}
          data-testid="anatomy-canvas-mount"
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={state.mode === "mri" ? { filter: "grayscale(1) contrast(1.35) brightness(1.08)" } : undefined}
        />

        {/* Mode / crew change: a quick scan sweep so every switch feels physical */}
        <div key={`${state.mode}:${state.suitActive}`} className="sx-modeflash pointer-events-none absolute inset-0 z-10" />

        {/* Vitals step aside while an organ is focused or an emergency is on screen, so the target stays visible */}
        {ready && !state.suitActive && !emergencyOpen && !state.selectedOrganId && (
          <SafeBoundary label="Vitals">
            <VitalsHud onSelectOrgan={onSelectOrgan} />
          </SafeBoundary>
        )}

        {/* Emergency: perimeter vignette at severe/critical levels */}
        {emergencyHud?.active && emShownLevel >= 3 && (
          <div
            data-testid="emergency-vignette"
            className={`pointer-events-none absolute inset-0 z-10 sx-em-vignette ${emShownLevel < 4 ? "sx-em-calm" : ""}`}
          />
        )}

        {/* Emergency: status badge */}
        {emergencyOpen && (
          <div
            data-testid="emergency-hud"
            className="pointer-events-none absolute left-3 top-[86px] z-20 hidden sm:block max-w-[280px] border bg-[#0a0710]/90 px-2.5 py-1.5 transition-colors duration-500"
            style={{ borderColor: `${emColor}88`, boxShadow: emShownLevel >= 3 ? `0 0 22px ${emColor}44` : undefined }}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em]" style={{ color: emColor }}>
              <Siren className={`w-3 h-3 ${emShownLevel >= 4 ? "animate-pulse" : ""}`} />
              {emergencyHud?.active ? `Emergency sim · L${emShownLevel} ${SEVERITY_META[emShownLevel].label}` : "Emergency simulation · standby"}
            </div>
            {emergencyHud?.active ? (
              <>
                <div className="mt-0.5 text-xs text-white leading-snug">{emergencyHud.name}</div>
                <div className="text-[10px] font-mono text-slate-400">
                  {comparing ? (comparePhase === 0 ? "COMPARE · showing NORMAL" : "COMPARE · showing EMERGENCY") : emergencyHud.stageLabel}
                </div>
              </>
            ) : (
              <div className="mt-0.5 text-[11px] text-slate-300">Click an organ to open its scenarios.</div>
            )}
            <div className="mt-1 text-[9px] font-mono tracking-wider text-amber-200/80">SIMULATED DATA · EDUCATIONAL</div>
          </div>
        )}

        {/* Emergency: leader line from the affected structure to a floating card */}
        {ready && emergencyHud?.active && emAnchor?.visible && (() => {
          const w = mountRef.current?.clientWidth ?? 800;
          const flip = emAnchor.x > w - 250;
          const ex = emAnchor.x + (flip ? -64 : 64);
          const ey = Math.max(70, emAnchor.y - 48);
          const cardX = flip ? ex - 8 : ex + 8;
          return (
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-testid="emergency-callout">
              <svg className="absolute inset-0 w-full h-full">
                <circle cx={emAnchor.x} cy={emAnchor.y} r={4} fill={emColor} />
                <circle cx={emAnchor.x} cy={emAnchor.y} r={9} fill="none" stroke={emColor} strokeOpacity={0.5} className={emShownLevel >= 4 ? "animate-pulse" : ""} />
                <polyline
                  points={`${emAnchor.x},${emAnchor.y} ${emAnchor.x + (flip ? -18 : 18)},${ey} ${ex},${ey}`}
                  fill="none"
                  stroke={emColor}
                  strokeWidth={1.2}
                  className="sx-em-lead"
                />
              </svg>
              <div
                className="absolute px-2 py-1 border bg-[#0a0710]/92 text-[10px] font-mono uppercase tracking-wider whitespace-nowrap"
                style={{
                  left: cardX,
                  top: ey,
                  transform: `translate(${flip ? "-100%" : "0"}, -50%)`,
                  borderColor: emColor,
                  color: emColor,
                }}
              >
                {emergencyHud.name.length > 34 ? `${emergencyHud.name.slice(0, 32)}…` : emergencyHud.name}
                <span className="ml-1.5 text-white">L{emShownLevel}</span>
              </div>
            </div>
          );
        })()}

        {/* MRI console: the slice image itself is rendered by WebGL into this corner */}
        {ready && state.mode === "mri" && (() => {
          const el = mountRef.current;
          const side = el ? Math.round(Math.min(el.clientWidth, el.clientHeight) * 0.3) : 0;
          const z = telemetry.mriSliceY;
          const frac = mriManual ?? (z != null ? Math.min(1, Math.max(0, z / 1.8)) : 0);
          return (
            <>
              <div className="sx-pop pointer-events-none absolute border border-white/60 shadow-[0_0_30px_rgba(255,255,255,0.12)]" style={{ right: 16, bottom: 16, width: side, height: side }}>
                <div className="absolute -top-5 left-0 right-0 flex justify-between text-[10px] font-mono uppercase tracking-wider text-slate-100">
                  <span>Axial slice · T1-style</span>
                  <span className="tabular-nums">{z != null ? `z ${z.toFixed(2)} m` : ""}</span>
                </div>
                <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/80">A</span>
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/80">P</span>
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/80">R</span>
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/80">L</span>
              </div>
              <div
                className="absolute z-20 flex flex-col items-center gap-1 bg-[#040d1c]/85 border border-white/25 px-1.5 py-2"
                style={{ right: side + 28, bottom: 16, height: side }}
              >
                <span className="text-[9px] font-mono text-slate-300">HEAD</span>
                <input
                  type="range"
                  aria-label="MRI slice height"
                  min={0}
                  max={1}
                  step={0.005}
                  value={frac}
                  onChange={(e) => {
                    const f = Number(e.target.value);
                    setMriManual(f);
                    controllerRef.current?.setMriSlice(f);
                  }}
                  className="flex-1 accent-white cursor-ns-resize"
                  style={{ writingMode: "vertical-lr", direction: "rtl", width: 16 }}
                />
                <span className="text-[9px] font-mono text-slate-300">FEET</span>
                <button
                  type="button"
                  onClick={() => {
                    setMriManual(null);
                    controllerRef.current?.setMriSlice(null);
                  }}
                  className={`mt-1 px-1.5 py-0.5 border text-[9px] font-mono uppercase ${mriManual === null ? "border-white bg-white/15 text-white" : "border-white/40 text-slate-200 hover:border-white"}`}
                >
                  Auto
                </button>
              </div>
              <div className="pointer-events-none absolute text-[9px] font-mono tracking-wider text-slate-300 text-right" style={{ right: 16, bottom: side + 40 }}>
                SIMULATED MRI FROM THE 3D TWIN · NOT A SCAN
              </div>
            </>
          );
        })()}

        {/* Top-left 360° Spatial Telemetry + Controls Hint */}
        <div
          className={`pointer-events-none hidden sm:flex absolute top-3 left-3 flex-col gap-1 border-l-2 border-cyan-400/60 pl-2.5 py-1 bg-[#040d1c]/85 border ${alertBorderClass} pr-3`}
        >
          <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/80 font-mono">
            360° Spatial Telemetry
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-200">
            <span>AZ {telemetry.azimuthDeg}°</span>
            <span>EL {telemetry.elevationDeg}°</span>
            <span>DIST {telemetry.zoomDistance.toFixed(2)}m</span>
          </div>
          <div className="text-[9px] font-mono tracking-wider text-slate-400 pt-0.5 border-t border-cyan-500/15">
            DRAG ORBIT · SCROLL ZOOM · DBL-CLICK FOCUS
          </div>
        </div>

        {/* Top-Center Prominent One-Click Human <-> Astronaut Transformation Switch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center bg-[#040d1c]/95 border border-cyan-400/45 shadow-[0_0_24px_rgba(0,140,255,0.22)]">
          <button
            type="button"
            data-testid="human-mode-btn"
            onClick={() => onToggleSuitMode(false)}
            aria-pressed={!state.suitActive}
            className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              !state.suitActive
                ? "bg-cyan-500/25 text-white border-r border-cyan-400/50"
                : "text-slate-300 hover:text-white border-r border-cyan-500/20"
            }`}
          >
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span>Normal Human</span>
          </button>
          <button
            type="button"
            data-testid="astronaut-mode-btn"
            onClick={() => onToggleSuitMode(true)}
            aria-pressed={state.suitActive}
            className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              state.suitActive
                ? "bg-[#12264d] text-cyan-100 shadow-[inset_0_0_12px_rgba(0,229,255,0.25)]"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-violet-400" />
            <span>Astronaut Spacesuit</span>
          </button>
          <button
            type="button"
            data-testid="emergency-mode-btn"
            onClick={() => onToggleEmergency(!emergencyOpen)}
            aria-pressed={emergencyOpen}
            title="Spaceflight Emergency Simulation: works with both Normal Human and Astronaut modes"
            className={`sx-em-btn relative px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap border-l border-rose-400/40 ${
              emergencyOpen ? "text-white" : "text-rose-100/90 hover:text-white"
            }`}
          >
            <span className="relative flex items-center justify-center">
              <Siren className="w-3.5 h-3.5 text-rose-400" />
              <span className="sx-em-ping absolute -inset-1 rounded-full border border-cyan-300/60" />
            </span>
            <span className="hidden md:inline">Emergency Sim</span>
            <span className="md:hidden">SOS</span>
          </button>
        </div>

        {/* Exploded View & AI HUD Dock (Visible when Astronaut Spacesuit Mode is Active) */}
        {state.suitActive && (
          <div
            data-testid="suit-viewport-controls"
            className="absolute bottom-3 left-3 z-20 bg-[#040d1c]/92 border border-cyan-400/35 p-2.5 flex flex-col gap-2 w-64"
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="suit-explode-slider"
                className="text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-300 flex items-center gap-1"
              >
                <Layers className="w-3 h-3" />
                Exploded View
              </label>
              <span className="text-[11px] font-mono tabular-nums text-white">
                {Math.round(state.explodeProgress * 100)}%
              </span>
            </div>
            <input
              id="suit-explode-slider"
              data-testid="suit-explode-slider"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={state.explodeProgress}
              onChange={(e) => onChangeExplodeProgress(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="open-ai-hud-btn"
                onClick={onOpenTelemetryHud}
                className={`flex-1 px-2 py-1 border text-[10px] font-mono uppercase flex items-center justify-center gap-1 transition-colors ${
                  telemetrySnapshot.overallStatus === "critical"
                    ? "bg-rose-500/20 border-rose-400 text-rose-100 hover:bg-rose-500/30"
                    : "bg-violet-500/20 border-violet-400/60 text-violet-100 hover:bg-violet-500/30"
                }`}
              >
                <Activity className="w-3 h-3" />
                AI Monitoring HUD
              </button>
              {state.explodeProgress > 0 && (
                <button
                  type="button"
                  data-testid="restore-suit-btn"
                  onClick={onRestoreSuit}
                  className="px-2 py-1 border border-cyan-500/35 bg-[#061529] text-[10px] font-mono uppercase text-cyan-200 hover:border-cyan-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restore
                </button>
              )}
            </div>
          </div>
        )}

        {/* Floating holographic 3D-projected anatomical & spacesuit labels */}
        {ready && state.display.showLabels && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {labels
              .filter((lbl) => lbl.visible)
              .map((lbl) => {
                const isAlertCrit = lbl.alertSeverity === "critical";
                const isAlertWarn = lbl.alertSeverity === "warning";
                return (
                  <button
                    key={`${lbl.kind}-${lbl.id}`}
                    type="button"
                    onClick={() => {
                      if (lbl.kind === "suit") {
                        onSelectSuitComponent(
                          lbl.id as SuitComponentId,
                          true,
                          lbl.id === "chest_display" || lbl.id === "wrist_bearings",
                        );
                      } else {
                        onSelectOrgan(lbl.id as AnatomyId, true);
                      }
                    }}
                    style={{
                      transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -50%)`,
                    }}
                    className={`pointer-events-auto absolute top-0 left-0 px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border transition-colors ${
                      isAlertCrit
                        ? "bg-[#240914]/95 border-rose-400 text-rose-100"
                        : isAlertWarn
                          ? "bg-[#221307]/95 border-orange-400 text-orange-100"
                          : lbl.selected
                            ? "bg-[#061830]/95 border-cyan-300 text-cyan-200 shadow-[0_0_12px_rgba(0,229,255,0.35)]"
                            : "bg-[#040d1c]/85 border-cyan-400/35 text-cyan-100/90 hover:border-cyan-300 hover:text-white"
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 mr-1.5 align-middle ${
                        isAlertCrit
                          ? "bg-rose-400"
                          : isAlertWarn
                            ? "bg-orange-400"
                            : "bg-cyan-400"
                      }`}
                    />
                    {lbl.name}
                  </button>
                );
              })}
          </div>
        )}

        {/* Thermal visualization legend (only in Thermal Mode) */}
        {state.mode === "thermal" && (
          <div
            data-testid="thermal-legend"
            className="absolute bottom-3 right-3 w-64 p-3 bg-[#040d1c]/92 border border-orange-400/35 text-xs z-20"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-orange-300">
                Thermal Gradient Layer
              </span>
              <span className="text-[10px] font-mono tabular-nums text-slate-300">
                {(state.thermalIntensity * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className="h-2.5 w-full border border-white/15"
              style={{ background: getThermalGradientCss() }}
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-300 mt-1">
              <span>Deep Blue (Low)</span>
              <span>Violet</span>
              <span>Yellow (Peak)</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
              {THERMAL_DISCLOSURE}
            </p>
          </div>
        )}

        {/* Loading state overlay */}
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030915]/90 z-10">
            <div className="w-64 border border-cyan-400/30 bg-[#061426] p-4">
              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-300 mb-2">
                Initializing 3D Anatomy Twin
              </div>
              <div className="h-1.5 w-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-150"
                  style={{ width: `${Math.max(12, loadProgress)}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-mono tabular-nums text-slate-400">
                <span>Loading mesh hierarchy</span>
                <span>{loadProgress}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Error fallback */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#030915]/95 z-10 p-6">
            <div className="max-w-sm border border-rose-500/40 bg-[#0c1220] p-4 text-xs text-rose-200">
              <div className="font-mono uppercase tracking-wider text-rose-400 mb-1">
                WebGL Viewport Error
              </div>
              <p>{error}</p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
