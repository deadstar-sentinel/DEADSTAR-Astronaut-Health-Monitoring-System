import { useMemo, useState } from "react";
import {
  Activity,
  Brain,
  Eye,
  Flame,
  Layers,
  Scan,
  Search,
  Sliders,
  Sparkles,
  X,
} from "lucide-react";
import {
  BODY_SYSTEMS,
  VISUALIZATION_MODES,
  type AnatomyId,
  type BodySystemId,
  type VisualizationMode,
} from "../data/anatomyCatalog.ts";
import {
  getFilteredStructures,
  type DisplaySettings,
  type SimulationState,
} from "../utils/simulationState.ts";

interface LeftControlPanelProps {
  state: SimulationState;
  isOpen: boolean;
  onCloseMobile: () => void;
  onSelectMode: (mode: VisualizationMode) => void;
  onSelectSystem: (sys: BodySystemId) => void;
  onSelectOrgan: (id: AnatomyId) => void;
  onChangeThermalIntensity: (val: number) => void;
  onToggleDisplay: (key: keyof DisplaySettings) => void;
}

const MODE_ICONS: Record<VisualizationMode, typeof Sparkles> = {
  holographic: Sparkles,
  xray: Scan,
  organ: Layers,
  muscular: Activity,
  nervous: Brain,
  thermal: Flame,
  realistic: Eye,
};

const SYSTEM_ABBR: Record<Exclude<BodySystemId, "all">, string> = {
  nervous: "NEURO",
  cardiovascular: "CARDIO",
  respiratory: "RESP",
  digestive: "DIGEST",
  renal: "RENAL",
  musculoskeletal: "MUSC",
};

export function LeftControlPanel({
  state,
  isOpen,
  onCloseMobile,
  onSelectMode,
  onSelectSystem,
  onSelectOrgan,
  onChangeThermalIntensity,
  onToggleDisplay,
}: LeftControlPanelProps) {
  const [query, setQuery] = useState("");

  const structures = useMemo(() => {
    const bySystem = getFilteredStructures(state.systemFilter);
    const q = query.trim().toLowerCase();
    if (!q) return bySystem;
    return bySystem.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.latinName.toLowerCase().includes(q) ||
        item.system.toLowerCase().includes(q),
    );
  }, [state.systemFilter, query]);

  return (
    <aside
      aria-label="Anatomy navigation and visualization controls"
      className={`${
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      } fixed lg:static inset-y-11 left-0 z-30 w-[272px] shrink-0 bg-[#051020] border-r border-cyan-500/20 flex flex-col transition-transform duration-200`}
    >
      {/* Mobile/Tablet drawer close header */}
      <div className="flex lg:hidden items-center justify-between px-3 py-2 border-b border-cyan-500/20">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-cyan-300">
          Simulation Controls
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close left panel"
          className="p-1 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto med-scroll p-3 space-y-4">
        {/* Section 1: 7 Visualization Modes */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300/90">
              Visualization Modes
            </h2>
            <span className="text-[10px] font-mono tabular-nums text-slate-400">7 MODES</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {VISUALIZATION_MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              const active = state.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMode(m.id)}
                  data-testid={`mode-${m.id}`}
                  aria-pressed={active}
                  className={`w-full text-left px-2.5 py-2 border transition-colors flex items-center gap-2.5 ${
                    active
                      ? "bg-[#0a2342] border-cyan-400 text-white"
                      : "bg-[#040c18] border-cyan-500/15 text-slate-300 hover:border-cyan-400/45 hover:text-white"
                  }`}
                >
                  <span
                    className="w-1 self-stretch shrink-0"
                    style={{ backgroundColor: active ? m.accentHex : "rgba(148,163,184,0.25)" }}
                  />
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: m.accentHex }} />
                  <span className="text-xs font-medium tracking-wide truncate">{m.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Thermal Intensity Control (highlighted when Thermal Mode is active) */}
        {state.mode === "thermal" && (
          <section className="p-2.5 bg-[#09182d] border border-orange-400/35 space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="thermal-intensity-slider"
                className="text-[10px] font-mono uppercase tracking-[0.12em] text-orange-300"
              >
                Thermal Intensity
              </label>
              <span className="text-xs font-mono tabular-nums text-orange-200">
                {Math.round(state.thermalIntensity * 100)}%
              </span>
            </div>
            <input
              id="thermal-intensity-slider"
              type="range"
              min={0.2}
              max={1.8}
              step={0.05}
              value={state.thermalIntensity}
              onChange={(e) => onChangeThermalIntensity(Number(e.target.value))}
              className="w-full accent-orange-400 cursor-pointer"
            />
          </section>
        )}

        {/* Section 2: Body Systems Filter */}
        <section>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300/90 mb-2">
            Body Systems
          </h2>
          <div className="grid grid-cols-2 gap-1">
            {BODY_SYSTEMS.map((sys) => {
              const active = state.systemFilter === sys.id;
              return (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => onSelectSystem(sys.id)}
                  aria-pressed={active}
                  className={`px-2 py-1.5 text-[11px] font-medium border text-left truncate transition-colors ${
                    active
                      ? "bg-cyan-500/15 border-cyan-400 text-cyan-200"
                      : "bg-[#040c18] border-cyan-500/15 text-slate-400 hover:border-cyan-400/40 hover:text-slate-200"
                  }`}
                >
                  {sys.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 3: Organ Directory */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300/90">
              Anatomical Directory
            </h2>
            <span className="text-[10px] font-mono tabular-nums text-slate-400">
              {structures.length} / 14
            </span>
          </div>

          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter organs or systems..."
              aria-label="Filter anatomical directory"
              className="w-full pl-8 pr-2.5 py-1.5 bg-[#030914] border border-cyan-500/20 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto med-scroll pr-0.5">
            {structures.map((item) => {
              const selected = state.selectedOrganId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`organ-${item.id}`}
                  onClick={() => onSelectOrgan(item.id)}
                  aria-pressed={selected}
                  className={`w-full px-2.5 py-1.5 border text-left flex items-center justify-between gap-2 transition-colors ${
                    selected
                      ? "bg-[#0b2747] border-cyan-400 text-white"
                      : "bg-[#040c18] border-cyan-500/10 text-slate-300 hover:border-cyan-400/40 hover:text-white"
                  }`}
                >
                  <span className="text-xs font-medium truncate">{item.name}</span>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 shrink-0">
                    {SYSTEM_ABBR[item.system]}
                  </span>
                </button>
              );
            })}
            {structures.length === 0 && (
              <div className="px-2.5 py-3 text-xs text-slate-400 border border-cyan-500/10 bg-[#040c18]">
                No structures match this filter.
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Display Settings */}
        <section className="pt-1 border-t border-cyan-500/15">
          <div className="flex items-center gap-1.5 mb-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300/90">
              Display Settings
            </h2>
          </div>

          <div className="space-y-1.5 text-xs">
            {(
              [
                ["showLabels", "Floating Labels"],
                ["showParticles", "Atmospheric & Surface Particles"],
                ["showScanLines", "Holographic Scan Sweep"],
                ["showSkinShell", "Outer Body Silhouette"],
              ] as [keyof DisplaySettings, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between px-2 py-1.5 bg-[#040c18] border border-cyan-500/15 cursor-pointer hover:border-cyan-400/35"
              >
                <span className="text-slate-300">{label}</span>
                <input
                  type="checkbox"
                  checked={state.display[key]}
                  onChange={() => onToggleDisplay(key)}
                  className="accent-cyan-400 w-3.5 h-3.5 cursor-pointer"
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
