import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bot,
  Crosshair,
  Eye,
  Focus,
  Send,
  X,
} from "lucide-react";
import { ANATOMY_BY_ID, type AnatomyId } from "../data/anatomyCatalog.ts";
import {
  getSelectedStructure,
  type SimulationState,
} from "../utils/simulationState.ts";
import { ForecastCard } from "./ForecastCard.tsx";

interface RightInspectorPanelProps {
  state: SimulationState;
  isOpen: boolean;
  onCloseMobile: () => void;
  onSelectOrgan: (id: AnatomyId | null) => void;
  onToggleIsolate: () => void;
  onRestoreBody: () => void;
  onFocusOrgan: (id: AnatomyId) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  source?: string;
}

const QUICK_ORGANS: AnatomyId[] = ["brain", "heart", "lungs", "pancreas"];

export function RightInspectorPanel({
  state,
  isOpen,
  onCloseMobile,
  onSelectOrgan,
  onToggleIsolate,
  onRestoreBody,
  onFocusOrgan,
}: RightInspectorPanelProps) {
  const selected = getSelectedStructure(state);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Select any anatomical structure in the 3D viewport or directory to inspect its location, biological function, and isolated 3D view. Ask me any anatomical question below.",
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

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          selectedOrganId: state.selectedOrganId,
          mode: state.mode,
          isolated: state.isolated,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { answer?: string; source?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            data.answer ||
            "No anatomical response returned. Try rephrasing your question.",
          source: data.source,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Assistant service is temporarily unreachable. Please inspect the anatomical overview panel above or try again.",
          source: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitQuestion(question);
  };

  return (
    <aside
      aria-label="Organ inspector and medical simulation assistant"
      className={`${
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      } fixed lg:static inset-y-11 right-0 z-30 w-[308px] shrink-0 bg-[#051020] border-l border-cyan-500/20 flex flex-col transition-transform duration-200`}
    >
      {/* Mobile/Tablet drawer header */}
      <div className="flex lg:hidden items-center justify-between px-3 py-2 border-b border-cyan-500/20">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-cyan-300">
          Organ Inspector & AI Guide
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

      {/* Top Half: Selected Organ Details */}
      <div className="flex-1 overflow-y-auto med-scroll p-3 space-y-3 border-b border-cyan-500/20">
        {selected ? (
          <div data-testid="organ-inspector-card" className="space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-cyan-500/20 pb-2.5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-400">
                  {selected.system} system
                </div>
                <h2 className="text-lg font-semibold text-white leading-tight mt-0.5">
                  {selected.name}
                </h2>
                <div className="text-[11px] font-mono text-slate-400">{selected.latinName}</div>
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

            {/* Action Buttons: Isolate / Restore & Camera Focus */}
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
                onClick={() => onFocusOrgan(selected.id)}
                className="px-2.5 py-2 border border-cyan-500/25 bg-[#040c18] text-xs font-medium text-slate-200 hover:border-cyan-400 hover:text-white flex items-center justify-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Zoom Focus
              </button>
            </div>

            <ForecastCard organId={selected.id} />

            {/* Anatomical Metadata */}
            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Anatomical Location
                </div>
                <p className="text-slate-200 leading-relaxed">{selected.location}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Biological Function
                </div>
                <p className="text-slate-200 leading-relaxed">{selected.biologicalFunction}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1">
                  Medical & Structural Details
                </div>
                <p className="text-slate-300 leading-relaxed">{selected.medicalDetails}</p>
              </div>

              <div className="p-2.5 bg-[#040c18] border border-cyan-500/15">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/80 mb-1.5">
                  Key Substructures
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {selected.keyStructures.map((sub) => (
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
                MODEL SOURCE: <span className="text-cyan-300 uppercase">{selected.assetSource}</span>
                <div className="mt-0.5 text-slate-500">{selected.assetNote}</div>
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
                Click any internal organ in the 3D hologram or choose from the directory to zoom,
                dim surrounding anatomy, and inspect biological functions. Double-click any organ
                for close-up focus.
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

      {/* Bottom Half: AI Medical Simulation Assistant */}
      <div className="h-[268px] shrink-0 flex flex-col bg-[#040b18]">
        <div className="px-3 py-2 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300">
              AI Medical Assistant
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
            </div>
          ))}
          {loading && (
            <div className="p-2 border border-cyan-500/15 bg-[#061325] text-cyan-300 font-mono text-[11px]">
              Querying anatomical model...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Context quick prompts */}
        <div className="px-2.5 py-1.5 border-t border-cyan-500/15 flex gap-1 overflow-x-auto med-scroll shrink-0">
          {[
            selected ? `Function of ${selected.name}?` : "Overview of cardiovascular system?",
            state.mode === "thermal" ? "Explain Thermal Mode colors" : "Anatomical landmarks?",
          ].map((prompt) => (
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
            placeholder="Ask about anatomy or mode..."
            aria-label="Ask AI medical assistant"
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
