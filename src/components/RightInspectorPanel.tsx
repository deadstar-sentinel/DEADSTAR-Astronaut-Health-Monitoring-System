import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Crosshair,
  Eye,
  Focus,
  Send,
  X,
} from "lucide-react";
import { ANATOMY_BY_ID, type AnatomyId } from "../data/anatomyCatalog.ts";
import { SUIT_COMPONENT_BY_ID, type SuitComponentId } from "../data/spacesuitCatalog.ts";
import type { SuitTelemetrySnapshot } from "../utils/telemetryEngine.ts";
import {
  getSelectedStructure,
  getSelectedSuitComponent,
  type SimulationState,
} from "../utils/simulationState.ts";
import { ForecastCard } from "../sentinel/ForecastCard.tsx";
import { SafeBoundary } from "../sentinel/SafeBoundary.tsx";
import { ProtocolList, type ProposedProtocol } from "../sentinel/ProtocolList.tsx";
import { useSentinel } from "../sentinel/api.tsx";

interface RightInspectorPanelProps {
  state: SimulationState;
  telemetrySnapshot: SuitTelemetrySnapshot;
  isOpen: boolean;
  externalPrompt?: { id: number; text: string } | null;
  onCloseMobile: () => void;
  onSelectOrgan: (id: AnatomyId | null) => void;
  onSelectSuitComponent: (id: SuitComponentId | null) => void;
  onToggleIsolate: () => void;
  onRestoreBody: () => void;
  onFocusOrgan: (id: AnatomyId) => void;
  onFocusSuitComponent: (id: SuitComponentId) => void;
  onOpenMonitoringHud: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  source?: string;
  protocols?: ProposedProtocol[];
}

const QUICK_ORGANS: AnatomyId[] = ["brain", "heart", "lungs", "pancreas"];
const QUICK_SUIT_PARTS: SuitComponentId[] = [
  "helmet_visor",
  "chest_display",
  "plss",
  "cooling_system",
];

export function RightInspectorPanel({
  state,
  telemetrySnapshot,
  isOpen,
  externalPrompt,
  onCloseMobile,
  onSelectOrgan,
  onSelectSuitComponent,
  onToggleIsolate,
  onRestoreBody,
  onFocusOrgan,
  onFocusSuitComponent,
  onOpenMonitoringHud,
}: RightInspectorPanelProps) {
  const { crewId, missionId } = useSentinel();
  const selectedOrgan = getSelectedStructure(state);
  const selectedSuit = getSelectedSuitComponent(state);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastHandledPromptId = useRef<number>(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Select any anatomical structure or EVA spacesuit subsystem in the 3D viewport to inspect functions, operating principles, telemetry, and isolated views.",
      source: "knowledge-base",
    },
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const submitQuestion = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");
    setLoading(true);

    const telemetrySummary = state.suitActive
      ? `HR ${telemetrySnapshot.vitals.heartRateBpm.value} BPM, SpO2 ${telemetrySnapshot.vitals.spo2Pct.value}%, O2 ${telemetrySnapshot.lifeSupport.remainingO2Pct.value}%, pCO2 ${telemetrySnapshot.lifeSupport.co2MmHg.value} mmHg, Suit Pressure ${telemetrySnapshot.lifeSupport.suitPressureKpa.value} kPa, Battery ${telemetrySnapshot.power.batteryPct.value}%`
      : "";

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          selectedOrganId: state.selectedOrganId,
          selectedSuitComponentId: state.selectedSuitComponentId,
          suitActive: state.suitActive,
          explodeProgress: state.explodeProgress,
          mode: state.mode,
          isolated: state.isolated,
          alerts: telemetrySnapshot.alerts,
          telemetrySummary,
          crewId,
          mission: missionId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { answer?: string; source?: string; protocols?: ProposedProtocol[] };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            data.answer ||
            "No response returned. Try rephrasing your anatomy or suit question.",
          source: data.source,
          protocols: Array.isArray(data.protocols) ? data.protocols : [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Assistant service is temporarily unreachable. Please inspect the overview panel above or try again.",
          source: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (externalPrompt && externalPrompt.id !== lastHandledPromptId.current) {
      lastHandledPromptId.current = externalPrompt.id;
      void submitQuestion(externalPrompt.text);
    }
  });

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitQuestion(question);
  };

  const componentAlerts = selectedSuit
    ? telemetrySnapshot.alerts.filter((a) => a.componentId === selectedSuit.id)
    : [];

  return (
    <aside
      aria-label="Organ and spacesuit inspector and AI simulation assistant"
      className={`${
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      } fixed lg:static inset-y-11 right-0 z-30 w-[308px] shrink-0 bg-[#051020] border-l border-cyan-500/20 flex flex-col transition-transform duration-200`}
    >
      {/* Mobile/Tablet drawer header */}
      <div className="flex lg:hidden items-center justify-between px-3 py-2 border-b border-cyan-500/20">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-cyan-300">
          Inspector & AI Guide
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close right panel"
          className="p-1 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Top Half: Selected Suit Component / Organ Details */}
      <div className="flex-1 overflow-y-auto med-scroll p-3 space-y-3 border-b border-cyan-500/20">
        {selectedSuit ? (
          <div data-testid="suit-inspector-card" className="space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-cyan-500/20 pb-2.5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-violet-300">
                  {selectedSuit.code} · {selectedSuit.subsystem.replace("_", " ")}
                </div>
                <h2 className="text-lg font-semibold text-white leading-tight mt-0.5">
                  {selectedSuit.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onSelectSuitComponent(null)}
                title="Clear component selection"
                aria-label="Clear spacesuit component selection"
                className="p-1.5 border border-cyan-500/20 text-slate-400 hover:text-white hover:border-cyan-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {componentAlerts.map((al) => (
              <div
                key={al.id}
                className={`p-2.5 border text-xs space-y-1 ${
                  al.severity === "critical"
                    ? "bg-[#220a14] border-rose-500/50 text-rose-100"
                    : "bg-[#211408] border-orange-400/50 text-orange-100"
                }`}
              >
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{al.title}</span>
                </div>
                <p className="text-[11px] leading-snug opacity-90">{al.reason}</p>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="isolate-suit-btn"
                onClick={state.isolated ? onRestoreBody : onToggleIsolate}
                className={`px-2.5 py-2 border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  state.isolated
                    ? "bg-cyan-500/20 border-cyan-300 text-cyan-100"
                    : "bg-[#081a33] border-cyan-500/30 text-cyan-200 hover:border-cyan-300"
                }`}
              >
                {state.isolated ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Restore Suit
                  </>
                ) : (
                  <>
                    <Focus className="w-3.5 h-3.5" />
                    Isolate Part
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onFocusSuitComponent(selectedSuit.id)}
                className="px-2.5 py-2 border border-cyan-500/25 bg-[#040c18] text-xs font-medium text-slate-200 hover:border-cyan-400 hover:text-white flex items-center justify-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Zoom Focus
              </button>
            </div>

            {(selectedSuit.id === "chest_display" || selectedSuit.id === "wrist_bearings") && (
              <button
                type="button"
                onClick={onOpenMonitoringHud}
                className="w-full px-2.5 py-2 border border-violet-400/50 bg-violet-500/15 text-xs font-mono uppercase text-violet-100 hover:bg-violet-500/25 flex items-center justify-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" />
                Open AI Monitoring Dashboard
              </button>
            )}

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Suit Location
                </div>
                <p className="text-slate-200 leading-relaxed">{selectedSuit.location}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Engineering Purpose
                </div>
                <p className="text-slate-200 leading-relaxed">{selectedSuit.purpose}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Operating Principles
                </div>
                <p className="text-slate-300 leading-relaxed">{selectedSuit.operatingPrinciples}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1.5">
                  Technical Specifications
                </div>
                <div className="space-y-1">
                  {selectedSuit.keySpecs.map((spec) => (
                    <div
                      key={spec}
                      className="px-2 py-1 bg-[#071529] border border-cyan-500/15 text-[11px] font-mono text-slate-200 truncate"
                    >
                      {spec}
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-2.5 py-2 bg-[#030914] border border-slate-700/60 text-[10px] font-mono text-slate-400">
                MODEL SOURCE:{" "}
                <span className="text-violet-300 uppercase">{selectedSuit.assetSource}</span>
                <div className="mt-0.5 text-slate-500">{selectedSuit.assetNote}</div>
              </div>
            </div>
          </div>
        ) : selectedOrgan ? (
          <div data-testid="organ-inspector-card" key={selectedOrgan.id} className="sx-stagger space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-cyan-500/20 pb-2.5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-400">
                  {selectedOrgan.system} system
                </div>
                <h2 className="text-lg font-semibold text-white leading-tight mt-0.5">
                  {selectedOrgan.name}
                </h2>
                <div className="text-[11px] font-mono text-slate-400">
                  {selectedOrgan.latinName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectOrgan(null)}
                title="Clear organ selection"
                aria-label="Clear organ selection"
                className="p-1.5 border border-cyan-500/20 text-slate-400 hover:text-white hover:border-cyan-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="isolate-organ-btn"
                onClick={state.isolated ? onRestoreBody : onToggleIsolate}
                className={`px-2.5 py-2 border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  state.isolated
                    ? "bg-cyan-500/20 border-cyan-300 text-cyan-100"
                    : "bg-[#081a33] border-cyan-500/30 text-cyan-200 hover:border-cyan-300"
                }`}
              >
                {state.isolated ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Restore Body
                  </>
                ) : (
                  <>
                    <Focus className="w-3.5 h-3.5" />
                    Isolate Organ
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onFocusOrgan(selectedOrgan.id)}
                className="px-2.5 py-2 border border-cyan-500/25 bg-[#040c18] text-xs font-medium text-slate-200 hover:border-cyan-400 hover:text-white flex items-center justify-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Zoom Focus
              </button>
            </div>

            <SafeBoundary label="Forecast">
              <ForecastCard organId={selectedOrgan.id} />
            </SafeBoundary>

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Anatomical Location
                </div>
                <p className="text-slate-200 leading-relaxed">{selectedOrgan.location}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Biological Function
                </div>
                <p className="text-slate-200 leading-relaxed">{selectedOrgan.biologicalFunction}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Medical & Structural Details
                </div>
                <p className="text-slate-300 leading-relaxed">{selectedOrgan.medicalDetails}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1.5">
                  Key Substructures
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {selectedOrgan.keyStructures.map((sub) => (
                    <div
                      key={sub}
                      className="px-2 py-1 bg-[#071529] border border-cyan-500/15 text-[11px] text-slate-200 truncate"
                    >
                      {sub}
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-2.5 py-2 bg-[#030914] border border-slate-700/60 text-[10px] font-mono text-slate-400">
                MODEL SOURCE:{" "}
                <span className="text-cyan-300 uppercase">{selectedOrgan.assetSource}</span>
                <div className="mt-0.5 text-slate-500">{selectedOrgan.assetNote}</div>
              </div>
            </div>
          </div>
        ) : state.suitActive ? (
          <div className="space-y-3">
            <div className="p-3 bg-[#040c18] border border-violet-400/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-violet-300">
                  EVA Life-Support Summary
                </span>
                <span className="text-[9px] font-mono text-slate-400">SIMULATED</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono tabular-nums">
                <div className="p-1.5 bg-[#071529] border border-cyan-500/15">
                  <div className="text-[9px] text-slate-400">HEART RATE</div>
                  <div className="text-cyan-200">{telemetrySnapshot.vitals.heartRateBpm.value} BPM</div>
                </div>
                <div className="p-1.5 bg-[#071529] border border-cyan-500/15">
                  <div className="text-[9px] text-slate-400">O2 RESERVE</div>
                  <div className="text-cyan-200">
                    {telemetrySnapshot.lifeSupport.remainingO2Pct.value}%
                  </div>
                </div>
                <div className="p-1.5 bg-[#071529] border border-cyan-500/15">
                  <div className="text-[9px] text-slate-400">SUIT PRESSURE</div>
                  <div className="text-cyan-200">
                    {telemetrySnapshot.lifeSupport.suitPressureKpa.value} kPa
                  </div>
                </div>
                <div className="p-1.5 bg-[#071529] border border-cyan-500/15">
                  <div className="text-[9px] text-slate-400">BATTERY</div>
                  <div className="text-emerald-300">{telemetrySnapshot.power.batteryPct.value}%</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenMonitoringHud}
                className="w-full py-1.5 border border-cyan-400/45 bg-cyan-500/15 text-[11px] font-mono uppercase text-cyan-100 hover:bg-cyan-500/25 flex items-center justify-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" />
                Open AI Dashboard & 48h Forecast
              </button>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1.5">
                Quick Suit Inspection
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_SUIT_PARTS.map((id) => {
                  const part = SUIT_COMPONENT_BY_ID[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectSuitComponent(id)}
                      className="px-2.5 py-2 bg-[#040c18] border border-cyan-500/20 text-left hover:border-violet-400 transition-colors"
                    >
                      <div className="text-xs font-medium text-white truncate">{part.name}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {part.code}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-[#040c18] border border-cyan-500/20">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300 mb-1">
                Full-Body Inspection Active
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Click any internal organ in the 3D hologram or transform into Astronaut Spacesuit
                Mode at the top of the viewport to inspect all 22 EVA life-support & suit systems.
              </p>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1.5">
                Quick Organ Jump
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ORGANS.map((id) => {
                  const org = ANATOMY_BY_ID[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectOrgan(id)}
                      className="px-2.5 py-2 bg-[#040c18] border border-cyan-500/20 text-left hover:border-cyan-400 transition-colors"
                    >
                      <div className="text-xs font-medium text-white">{org.name}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {org.system}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Half: AI Medical & Aerospace Simulation Assistant */}
      <div className="h-[268px] shrink-0 flex flex-col bg-[#040b18]">
        <div className="px-3 py-2 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300">
              {state.suitActive ? "AI Suit & Medical Guide" : "AI Medical Assistant"}
            </span>
          </div>
          <span className="text-[9px] font-mono text-slate-400">EDUCATIONAL</span>
        </div>

        <div className="flex-1 overflow-y-auto med-scroll p-2.5 space-y-2 text-xs">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-2 border leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#0b2340] border-cyan-400/30 text-cyan-50 ml-4"
                  : "bg-[#061325] border-cyan-500/15 text-slate-200 mr-2"
              }`}
            >
              <div>{msg.text}</div>
              {msg.source && msg.role === "assistant" && (
                <div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-slate-500">
                  Source: {msg.source}
                </div>
              )}
              {msg.role === "assistant" && msg.protocols && msg.protocols.length > 0 && (
                <SafeBoundary label="Protocols">
                  <ProtocolList protocols={msg.protocols} />
                </SafeBoundary>
              )}
            </div>
          ))}
          {loading && (
            <div className="p-2 border border-cyan-500/15 bg-[#061325] text-cyan-300 font-mono text-[11px]">
              Querying simulation model...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Context quick prompts */}
        <div className="px-2.5 py-1.5 border-t border-cyan-500/15 flex gap-1 overflow-x-auto med-scroll shrink-0">
          {(state.suitActive
            ? [
                selectedSuit ? `How does ${selectedSuit.name} work?` : "Explain PLSS O2 & CO2 loop",
                telemetrySnapshot.alerts.length > 0
                  ? "Why did this alert trigger?"
                  : "Explain 48h forecast assumptions",
              ]
            : [
                selectedOrgan
                  ? `Function of ${selectedOrgan.name}?`
                  : "Overview of cardiovascular system?",
                state.mode === "thermal" ? "Explain Thermal Mode colors" : "Anatomical landmarks?",
              ]
          ).map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void submitQuestion(prompt)}
              className="px-2 py-1 bg-[#07162b] border border-cyan-500/20 text-[10px] font-mono text-cyan-200/90 hover:border-cyan-400 whitespace-nowrap shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleFormSubmit}
          className="p-2 border-t border-cyan-500/20 flex items-center gap-1.5"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              state.suitActive ? "Ask about suit systems or alerts..." : "Ask about anatomy or mode..."
            }
            aria-label="Ask AI medical and spacesuit assistant"
            className="flex-1 min-w-0 px-2.5 py-1.5 bg-[#030914] border border-cyan-500/25 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            aria-label="Send question"
            className="px-2.5 py-1.5 bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
}
