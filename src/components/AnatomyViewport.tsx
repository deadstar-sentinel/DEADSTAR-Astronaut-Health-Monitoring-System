import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AnatomyId, CameraPresetId } from "../data/anatomyCatalog.ts";
import { THERMAL_DISCLOSURE, getThermalGradientCss } from "../utils/thermalPalette.ts";
import type { SimulationState } from "../utils/simulationState.ts";
import {
  MedicalViewportController,
  type LabelProjection,
  type TelemetryReadout,
} from "../three/MedicalViewport.ts";

export interface AnatomyViewportHandle {
  focusCameraPreset: (preset: CameraPresetId) => void;
  focusOnOrgan: (organId: AnatomyId, closeZoom?: boolean) => void;
}

interface AnatomyViewportProps {
  state: SimulationState;
  onSelectOrgan: (id: AnatomyId | null, focusZoom: boolean) => void;
}

export const AnatomyViewport = forwardRef<AnatomyViewportHandle, AnatomyViewportProps>(
  function AnatomyViewport({ state, onSelectOrgan }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<MedicalViewportController | null>(null);
    const onSelectRef = useRef(onSelectOrgan);
    onSelectRef.current = onSelectOrgan;

    const initialStateRef = useRef(state);

    const [loadProgress, setLoadProgress] = useState(0);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [labels, setLabels] = useState<LabelProjection[]>([]);
    const [telemetry, setTelemetry] = useState<TelemetryReadout>({
      azimuthDeg: 8,
      elevationDeg: 4,
      zoomDistance: 2.51,
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
        onSelectOrgan: (id, focusZoom) => onSelectRef.current(id, focusZoom),
        onTelemetry: (t) => setTelemetry(t),
        onLabelsProject: (projected) => setLabels(projected),
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

    return (
      <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#030915]">
        {/* Isolated WebGL canvas mount node */}
        <div
          ref={mountRef}
          data-testid="anatomy-canvas-mount"
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Subtle holographic reticle corners */}
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1 border-l-2 border-cyan-400/60 pl-2.5 py-0.5 bg-[#040d1c]/80 border border-cyan-500/20 pr-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/80 font-mono">
            360° Spatial Telemetry
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-200">
            <span>AZ {telemetry.azimuthDeg}°</span>
            <span>EL {telemetry.elevationDeg}°</span>
            <span>DIST {telemetry.zoomDistance.toFixed(2)}m</span>
          </div>
        </div>

        {/* Navigation hint top-right */}
        <div className="pointer-events-none hidden sm:block absolute top-3 right-3 px-2.5 py-1.5 bg-[#040d1c]/80 border border-cyan-500/20 text-[10px] font-mono tracking-wider text-slate-300">
          DRAG: ORBIT · SCROLL: ZOOM · RIGHT-DRAG: PAN · DBL-CLICK: FOCUS
        </div>

        {/* Floating holographic 3D-projected anatomical labels */}
        {ready && state.display.showLabels && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {labels
              .filter((lbl) => lbl.visible)
              .map((lbl) => (
                <button
                  key={lbl.id}
                  type="button"
                  onClick={() => onSelectOrgan(lbl.id, true)}
                  style={{
                    transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -50%)`,
                  }}
                  className={`pointer-events-auto absolute top-0 left-0 px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border transition-colors ${
                    lbl.selected
                      ? "bg-[#061830]/95 border-cyan-300 text-cyan-200 shadow-[0_0_12px_rgba(0,229,255,0.35)]"
                      : "bg-[#040d1c]/85 border-cyan-400/35 text-cyan-100/90 hover:border-cyan-300 hover:text-white"
                  }`}
                >
                  <span className="inline-block w-1.5 h-1.5 bg-cyan-400 mr-1.5 align-middle" />
                  {lbl.name}
                </button>
              ))}
          </div>
        )}

        {/* Thermal visualization legend (only in Thermal Mode) */}
        {state.mode === "thermal" && (
          <div
            data-testid="thermal-legend"
            className="absolute bottom-3 right-3 w-64 p-3 bg-[#040d1c]/92 border border-orange-400/35 text-xs"
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
