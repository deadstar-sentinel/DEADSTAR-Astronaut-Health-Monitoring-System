import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, ChevronDown, Crosshair, Focus, Info, Play, RotateCcw, Send, Siren, X } from "lucide-react";
import {
  EMERGENCY_BY_ID,
  EVIDENCE_META,
  SEVERITY_META,
  answerLocally,
  explanationSections,
  indicatorValue,
  maxLevel,
  severityHex,
  type EmergencyScenario,
} from "../../data/emergencyScenarios.ts";
import type { EmergencyState } from "../../utils/emergencyState.ts";
import { displayedLevel } from "../../utils/emergencyState.ts";
import { EvidenceBadge } from "./EmergencyLeftPanel.tsx";

interface Props {
  emergency: EmergencyState;
  suitActive: boolean;
  isOpen: boolean;
  onCloseMobile: () => void;
  onActivate: (id: string) => void;
  onStop: () => void;
  onFocus: (s: EmergencyScenario) => void;
  onIsolate: (s: EmergencyScenario) => void;
  onPreviewScenario: (id: string) => void;
}

const FEATURED = ["venous_thrombosis", "sans", "hypercapnia", "bone_loss", "muscle_atrophy", "kidney_stone"];

interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
  title?: string;
  source: "local" | "gemini" | "user";
}

export function EmergencyRightPanel({
  emergency,
  suitActive,
  isOpen,
  onCloseMobile,
  onActivate,
  onStop,
  onFocus,
  onIsolate,
  onPreviewScenario,
}: Props) {
  const scenario = emergency.selectedScenarioId ? EMERGENCY_BY_ID[emergency.selectedScenarioId] : null;
  const isActive = Boolean(scenario && emergency.activeScenarioId === scenario.id);
  const level = isActive ? displayedLevel(emergency) : 0;

  return (
    <aside
      aria-label="Emergency scenario details and AI space medicine assistant"
      data-testid="emergency-right-panel"
      className={`${
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      } fixed lg:static inset-y-11 right-0 z-30 w-[320px] shrink-0 bg-[#051020] border-l border-rose-400/25 flex flex-col transition-transform duration-200`}
    >
      <div className="flex lg:hidden items-center justify-between px-3 py-2 border-b border-rose-400/20">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-rose-200">Scenario & assistant</span>
        <button type="button" onClick={onCloseMobile} aria-label="Close scenario panel" className="p-1 text-slate-300 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!scenario ? (
          <EmptyState onPreviewScenario={onPreviewScenario} />
        ) : (
          <ScenarioDetail
            key={scenario.id}
            scenario={scenario}
            emergency={emergency}
            isActive={isActive}
            level={level}
            suitActive={suitActive}
            onActivate={onActivate}
            onStop={onStop}
            onFocus={onFocus}
            onIsolate={onIsolate}
          />
        )}
      </div>
    </aside>
  );
}

function EmptyState({ onPreviewScenario }: { onPreviewScenario: (id: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <div className="border border-rose-400/30 bg-rose-500/[0.06] p-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-rose-200">
          <Siren className="w-3.5 h-3.5" /> Emergency mode active
        </div>
        <p className="mt-2 text-sm text-slate-200 leading-relaxed">
          Click an organ on the 3D body, or choose a body system on the left, to open its emergency scenarios.
        </p>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          Only the affected structures change colour: yellow (mild), orange (moderate), red (severe), pulsing red
          (critical). Everything else stays cyan.
        </p>
      </div>
      <div>
        <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1.5">Featured scenarios</h3>
        <div className="space-y-1">
          {FEATURED.map((id) => {
            const s = EMERGENCY_BY_ID[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPreviewScenario(id)}
                className="sx-press w-full px-2.5 py-2 border border-cyan-500/20 bg-[#040c18] hover:border-cyan-300 text-left"
              >
                <div className="text-xs font-medium text-white">{s.name}</div>
                <EvidenceBadge evidence={s.evidence} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScenarioDetail({
  scenario,
  emergency,
  isActive,
  level,
  suitActive,
  onActivate,
  onStop,
  onFocus,
  onIsolate,
}: {
  scenario: EmergencyScenario;
  emergency: EmergencyState;
  isActive: boolean;
  level: number;
  suitActive: boolean;
  onActivate: (id: string) => void;
  onStop: () => void;
  onFocus: (s: EmergencyScenario) => void;
  onIsolate: (s: EmergencyScenario) => void;
}) {
  const max = maxLevel(scenario);
  const stageLabel = scenario.stages[Math.min(level, scenario.stages.length - 1)];
  const sev = SEVERITY_META[level];
  const evidence = EVIDENCE_META[scenario.evidence];
  const tick = useTick(isActive && !emergency.paused);

  return (
    <div className="p-3 space-y-3 sx-rise">
      {/* Scenario card */}
      <section
        className="border bg-[#040c18] p-3 transition-colors duration-500"
        style={{ borderColor: isActive && level > 0 ? `${severityHex(level)}99` : "rgba(0,229,255,0.25)" }}
      >
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">Selected scenario</div>
        <h2 className="mt-1 text-base font-semibold text-white leading-snug">{scenario.name}</h2>
        <EvidenceBadge evidence={scenario.evidence} />
        <p className="mt-1 text-[10px] text-slate-500">{evidence.label}</p>

        <div className="mt-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400 mb-1">Affected structures</div>
          <div className="flex flex-wrap gap-1">
            {scenario.affected.map((a) => (
              <span key={a} className="px-1.5 py-0.5 text-[10px] border border-cyan-500/25 text-cyan-100 bg-cyan-500/5">
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* Severity scale */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">Severity</span>
            <span className={`text-[11px] font-mono uppercase ${sev.text}`} data-testid="em-severity-label">
              L{level} · {sev.label}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-5 gap-0.5" aria-hidden="true">
            {SEVERITY_META.map((m) => {
              const reachable = m.level <= max;
              const on = isActive && m.level <= level && m.level > 0;
              return (
                <span
                  key={m.level}
                  className={`h-1.5 transition-all duration-500 ${m.level === 4 && on ? "animate-pulse" : ""}`}
                  style={{
                    background: on ? m.hex : m.level === 0 ? "#00E5FF55" : reachable ? `${m.hex}26` : "#0b1626",
                  }}
                />
              );
            })}
          </div>
          <div className="mt-1 text-[11px] text-slate-300">
            {isActive ? (
              <>
                Stage: <span className="text-white">{stageLabel}</span>
              </>
            ) : (
              <span className="text-slate-400">Scale for this scenario: L0–L{max} ({scenario.stages.length} stages)</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          {isActive ? (
            <button
              type="button"
              data-testid="em-reset"
              onClick={onStop}
              className="sx-press flex-1 px-3 py-2 border border-cyan-300 bg-cyan-500/15 text-[11px] font-mono uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/25 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to normal
            </button>
          ) : (
            <button
              type="button"
              data-testid="em-activate"
              onClick={() => onActivate(scenario.id)}
              className="sx-press sx-em-cta flex-1 px-3 py-2 border border-rose-300 bg-rose-500/20 text-[11px] font-mono uppercase tracking-[0.14em] text-white hover:bg-rose-500/30 flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Activate simulation
            </button>
          )}
          <button
            type="button"
            title="Focus camera on the affected region"
            onClick={() => onFocus(scenario)}
            className="sx-press p-2 border border-cyan-500/30 text-cyan-200 hover:border-cyan-300"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          {scenario.fx.primary && (
            <button
              type="button"
              title="Isolate the affected organ"
              onClick={() => onIsolate(scenario)}
              className="sx-press p-2 border border-cyan-500/30 text-cyan-200 hover:border-cyan-300"
            >
              <Focus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {suitActive && scenario.suitScenario && (
          <p className="mt-2 text-[10px] text-violet-200/90 leading-snug">
            Astronaut mode: activating also sends the matching simulated warning to the suit's AI Monitoring HUD.
          </p>
        )}
      </section>

      {/* Indicators */}
      <section className="border border-cyan-500/20 bg-[#040c18] p-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">Monitoring indicators</h3>
          <span className="px-1.5 py-px border border-amber-300/60 text-[9px] font-mono tracking-wider text-amber-200">SIMULATED</span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {scenario.indicators.map((ind, i) => {
              const raw = indicatorValue(ind, level);
              const jitter = isActive && !emergency.paused ? Math.sin(tick * 1.7 + i * 2.3) * Math.max(0.15, Math.abs(raw) * 0.004) : 0;
              const v = raw + jitter;
              return (
                <tr key={ind.label} className="border-t border-cyan-500/10 first:border-t-0">
                  <td className="py-1 pr-2 text-slate-300">{ind.label}</td>
                  <td className="py-1 text-right font-mono tabular-nums text-white whitespace-nowrap">
                    {v.toFixed(ind.decimals)} <span className="text-slate-500 text-[10px]">{ind.unit}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-snug">
          <dt className="font-mono text-amber-200">SIMULATED</dt>
          <dd className="text-slate-400">Generated by this educational simulation.</dd>
          <dt className="font-mono text-slate-400">MEASURED</dt>
          <dd className="text-slate-500">None. No medical sensor is connected.</dd>
          <dt className="font-mono text-slate-400">PREDICTED</dt>
          <dd className="text-slate-500">Not used in this mode.</dd>
        </dl>
      </section>

      {scenario.fx.porosity && <BoneSection level={level} />}
      {scenario.fx.shrink && <MuscleSection level={level} />}

      <Assistant scenario={scenario} level={level} isActive={isActive} suitActive={suitActive} />

      <section className="border border-emerald-400/25 bg-emerald-500/[0.04] p-3">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-200">Suggested educational response</h3>
        <p className="mt-1.5 text-xs text-slate-200 leading-relaxed">{scenario.response}</p>
        <p className="mt-1.5 text-[10px] text-slate-500">For learning only. Not medical advice or an operational procedure.</p>
      </section>
    </div>
  );
}

/* ----------------------------- assistant ----------------------------- */

function Assistant({
  scenario,
  level,
  isActive,
  suitActive,
}: {
  scenario: EmergencyScenario;
  level: number;
  isActive: boolean;
  suitActive: boolean;
}) {
  const sections = useMemo(() => explanationSections(scenario), [scenario]);
  const [open, setOpen] = useState<number[]>([0, 6]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q, source: "user" }]);
    setBusy(true);
    const local = answerLocally(scenario, q);
    let reply: AssistantMessage = { role: "assistant", title: local.q, text: local.a, source: "local" };
    try {
      const context = [
        `Scenario: ${scenario.name} (${EVIDENCE_META[scenario.evidence].label})`,
        `Status: ${isActive ? `active, level ${level} (${SEVERITY_META[level].label}), stage "${scenario.stages[Math.min(level, scenario.stages.length - 1)]}"` : "selected, not activated"}`,
        `Mode: ${suitActive ? "astronaut spacesuit" : "normal human anatomy"}`,
        ...sections.map((s) => `${s.q} ${s.a}`),
      ].join("\n");
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, suitActive, emergencyContext: context }),
      });
      if (res.ok) {
        const data = (await res.json()) as { answer?: string; source?: string };
        if (data.source === "gemini" && data.answer) {
          reply = { role: "assistant", text: data.answer, source: "gemini" };
        }
      }
    } catch {
      // Network failure: the local knowledge-base answer stands.
    }
    setMessages((m) => [...m, reply]);
    setBusy(false);
  };

  return (
    <section className="border border-violet-400/30 bg-violet-500/[0.04]">
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <Bot className="w-4 h-4 text-violet-300" />
        <h3 className="text-[11px] font-mono uppercase tracking-[0.14em] text-violet-100">Space medicine assistant</h3>
      </div>
      <p className="px-3 text-[10px] text-slate-400 leading-snug flex gap-1">
        <Info className="w-3 h-3 shrink-0 mt-px" />
        Answers come from a curated local knowledge base. A live AI model is used only if the server has one
        configured, and its answers are labelled.
      </p>
      <div className="mt-2 border-t border-violet-400/15">
        {sections.map((s, i) => {
          const isOpen = open.includes(i);
          return (
            <div key={s.q} className="border-b border-violet-400/10 last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))}
                aria-expanded={isOpen}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-violet-500/10"
              >
                <span className="text-[10px] font-mono text-violet-300 tabular-nums">{i + 1}</span>
                <span className="text-xs text-slate-100 flex-1">{s.q}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="px-3 pb-2 pl-7 text-xs text-slate-300 leading-relaxed sx-fade">{s.a}</p>}
            </div>
          );
        })}
      </div>

      {messages.length > 0 && (
        <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-2 border-t border-violet-400/15">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[95%] px-2 py-1.5 text-xs leading-relaxed text-left ${
                  m.role === "user" ? "bg-cyan-500/15 border border-cyan-400/30 text-cyan-50" : "bg-[#0a1428] border border-violet-400/25 text-slate-200"
                }`}
              >
                {m.title && <div className="text-[10px] font-mono uppercase tracking-wider text-violet-300 mb-0.5">{m.title}</div>}
                {m.text}
                {m.role === "assistant" && (
                  <div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-slate-500">
                    Source: {m.source === "gemini" ? "Gemini (live model)" : "Local knowledge base"}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={ask} className="flex items-center gap-1.5 p-2 border-t border-violet-400/15">
        <input
          id="em-assistant-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask: why does this happen in space?"
          className="flex-1 min-w-0 bg-[#030914] border border-violet-400/30 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-300"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          aria-label="Ask the assistant"
          className="p-1.5 border border-violet-400/50 text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </section>
  );
}

/* -------------------------- comparison panels -------------------------- */

function BoneSection({ level }: { level: number }) {
  return (
    <section className="border border-amber-300/25 bg-[#040c18] p-3">
      <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">Bone cross-section (illustrative)</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <BoneSvg label="Normal" loss={0} />
        <BoneSvg label={`Simulated L${level}`} loss={level / 4} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500 leading-snug">
        Trabecular struts thin and disconnect as density falls. Exaggerated for visibility; real losses are a few percent.
      </p>
    </section>
  );
}

function BoneSvg({ label, loss }: { label: string; loss: number }) {
  const struts = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; k: number }[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 6 + rnd() * 20;
      const x = 40 + Math.cos(a) * r;
      const y = 40 + Math.sin(a) * r;
      const b = rnd() * Math.PI;
      const len = 4 + rnd() * 6;
      out.push({ x1: x, y1: y, x2: x + Math.cos(b) * len, y2: y + Math.sin(b) * len, k: rnd() });
    }
    return out;
  }, []);
  const color = severityHex(loss * 4);
  return (
    <figure className="text-center">
      <svg viewBox="0 0 80 80" className="w-full h-auto" role="img" aria-label={`${label} bone cross-section`}>
        <circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth={5 - loss * 2.2} opacity="0.85" />
        {struts.map((s, i) =>
          s.k < loss * 0.6 ? null : (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={1.5 - loss * 0.7} opacity="0.75" />
          ),
        )}
      </svg>
      <figcaption className="text-[10px] font-mono text-slate-400 mt-0.5">{label}</figcaption>
    </figure>
  );
}

function MuscleSection({ level }: { level: number }) {
  const n = level / 4;
  const color = severityHex(level);
  return (
    <section className="border border-rose-300/20 bg-[#040c18] p-3">
      <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">Muscle cross-section (illustrative)</h3>
      <svg viewBox="0 0 160 70" className="mt-2 w-full h-auto" role="img" aria-label="Normal versus simulated muscle cross-section">
        <ellipse cx="40" cy="35" rx="30" ry="24" fill="#00E5FF22" stroke="#00E5FF" strokeWidth="1.2" />
        <text x="40" y="66" textAnchor="middle" fontSize="7" fill="#94a3b8" fontFamily="monospace">NORMAL</text>
        <ellipse cx="120" cy="35" rx="30" ry="24" fill="none" stroke="#00E5FF" strokeDasharray="2 2" strokeWidth="0.8" opacity="0.6" />
        <ellipse cx="120" cy="35" rx={30 * (1 - 0.3 * n)} ry={24 * (1 - 0.3 * n)} fill={`${color}33`} stroke={color} strokeWidth="1.2" />
        <text x="120" y="66" textAnchor="middle" fontSize="7" fill="#94a3b8" fontFamily="monospace">SIMULATED L{level}</text>
      </svg>
      <p className="mt-1 text-[10px] text-slate-500 leading-snug">
        Dashed outline: preflight size. The 3D view shows the same comparison with a cyan outline around shrinking muscles.
      </p>
    </section>
  );
}

function useTick(running: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setT((x) => x + 1), 900);
    return () => window.clearInterval(id);
  }, [running]);
  return t;
}
