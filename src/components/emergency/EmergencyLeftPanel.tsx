import {
  Activity,
  Bone,
  Brain,
  Dumbbell,
  Eye,
  HeartPulse,
  History,
  Shield,
  Siren,
  Soup,
  Wind,
  X,
  Droplets,
  type LucideIcon,
} from "lucide-react";
import {
  EMERGENCY_BY_ID,
  EMERGENCY_CATEGORIES,
  EMERGENCY_CATEGORY_BY_ID,
  EVIDENCE_META,
  SEVERITY_META,
  type EmergencyCategoryId,
  type EvidenceClass,
} from "../../data/emergencyScenarios.ts";
import type { EmergencyState } from "../../utils/emergencyState.ts";

const CATEGORY_ICON: Record<EmergencyCategoryId, LucideIcon> = {
  cardiovascular: HeartPulse,
  neuro: Brain,
  respiratory: Wind,
  muscular: Dumbbell,
  skeletal: Bone,
  eyes: Eye,
  renal: Droplets,
  immune: Shield,
  digestive: Soup,
};

interface Props {
  emergency: EmergencyState;
  isOpen: boolean;
  onCloseMobile: () => void;
  onSelectCategory: (id: EmergencyCategoryId) => void;
  onPreviewScenario: (id: string) => void;
}

export function EmergencyLeftPanel({ emergency, isOpen, onCloseMobile, onSelectCategory, onPreviewScenario }: Props) {
  const category = EMERGENCY_CATEGORY_BY_ID[emergency.categoryId];

  return (
    <aside
      aria-label="Emergency simulation: body systems and scenarios"
      data-testid="emergency-left-panel"
      className={`${
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      } fixed lg:static inset-y-11 left-0 z-30 w-[272px] shrink-0 bg-[#051020] border-r border-rose-400/25 flex flex-col transition-transform duration-200`}
    >
      <div className="flex lg:hidden items-center justify-between px-3 py-2 border-b border-rose-400/20">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-rose-200">Emergency library</span>
        <button type="button" onClick={onCloseMobile} aria-label="Close emergency library" className="p-1 text-slate-300 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 pt-3 pb-2.5 border-b border-rose-400/15 bg-gradient-to-b from-rose-500/[0.07] to-transparent">
        <div className="flex items-center gap-2">
          <span className="relative flex items-center justify-center w-7 h-7 border border-rose-400/60 bg-rose-500/10">
            <Siren className="w-4 h-4 text-rose-300" />
            <span className="sx-em-ping absolute inset-0 border border-cyan-300/50" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-white">Emergency Simulation</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">Educational · demonstration data</div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        <section>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1.5">Body systems</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {EMERGENCY_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c.id];
              const active = c.id === emergency.categoryId;
              const running = emergency.activeScenarioId
                ? c.scenarioIds.includes(emergency.activeScenarioId)
                : false;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`em-cat-${c.id}`}
                  onClick={() => onSelectCategory(c.id)}
                  aria-pressed={active}
                  className={`sx-press relative px-2 py-1.5 border text-left transition-colors ${
                    active
                      ? "bg-rose-500/10 border-rose-300/70 text-white"
                      : "bg-[#040c18] border-cyan-500/20 text-slate-300 hover:border-cyan-300/70 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-rose-300" : "text-cyan-400"}`} />
                    <span className="text-[11px] font-medium truncate">{c.short}</span>
                    <span className="ml-auto text-[10px] font-mono tabular-nums text-slate-500">{c.scenarioIds.length}</span>
                  </div>
                  {running && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-400 animate-pulse" />}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-1.5">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">Scenarios</h2>
            <span className="text-[10px] font-mono text-slate-500 truncate ml-2">{category.label}</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-2 leading-snug">{category.description}</p>
          <div className="space-y-1">
            {category.scenarioIds.map((id) => {
              const s = EMERGENCY_BY_ID[id];
              const selected = emergency.selectedScenarioId === id;
              const running = emergency.activeScenarioId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`em-scn-${id}`}
                  onClick={() => onPreviewScenario(id)}
                  aria-pressed={selected}
                  className={`sx-press w-full px-2.5 py-2 border text-left transition-colors ${
                    running
                      ? "bg-rose-500/15 border-rose-400 text-white"
                      : selected
                        ? "bg-cyan-500/10 border-cyan-300 text-white"
                        : "bg-[#040c18] border-cyan-500/15 text-slate-200 hover:border-cyan-400/70"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium leading-snug flex-1">{s.name}</span>
                    {running && <Activity className="w-3.5 h-3.5 text-rose-300 shrink-0 animate-pulse" />}
                  </div>
                  <EvidenceBadge evidence={s.evidence} />
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1.5">
            <History className="w-3 h-3" /> Simulation history
          </h2>
          {emergency.history.length === 0 ? (
            <p className="text-[11px] text-slate-500">No scenarios run yet in this session.</p>
          ) : (
            <ul className="space-y-1">
              {emergency.history.map((h) => {
                const s = EMERGENCY_BY_ID[h.scenarioId];
                const sev = SEVERITY_META[h.peakLevel];
                return (
                  <li key={`${h.scenarioId}-${h.startedAt}`}>
                    <button
                      type="button"
                      onClick={() => onPreviewScenario(h.scenarioId)}
                      className="w-full flex items-center gap-2 px-2 py-1 border border-cyan-500/10 bg-[#040c18] hover:border-cyan-400/50 text-left"
                    >
                      <span className="text-[10px] font-mono tabular-nums text-slate-500">
                        {new Date(h.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className="text-[11px] text-slate-200 truncate flex-1">{s?.name}</span>
                      <span className={`text-[10px] font-mono ${sev.text}`}>L{h.peakLevel}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border-t border-cyan-500/10 pt-3">
          <h2 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1.5">Evidence labels</h2>
          <ul className="space-y-1">
            {(Object.keys(EVIDENCE_META) as EvidenceClass[]).map((k) => (
              <li key={k} className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className={`px-1.5 py-px border text-[9px] font-mono tracking-wider ${EVIDENCE_META[k].className}`}>
                  {EVIDENCE_META[k].short}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}

export function EvidenceBadge({ evidence }: { evidence: EvidenceClass }) {
  const meta = EVIDENCE_META[evidence];
  return (
    <span
      title={meta.label}
      className={`inline-block mt-1 px-1.5 py-px border text-[9px] font-mono tracking-wider ${meta.className}`}
    >
      {meta.short}
    </span>
  );
}
