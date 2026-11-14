import { useState } from "react";
import { bandStyle } from "./api.tsx";

export interface ProposedProtocol {
  id: string;
  title: string;
  crew: string;
  severity: string;
  why: string;
  act_within_min: number | null;
  earth_reply_min: number | null;
  onboard: boolean;
  steps: string[];
  source: string;
}

const fmt = (m: number) => (m < 120 ? `${Math.round(m)} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);

/** "Proposed protocols" block under an AI medical officer answer: what to do now, ranked by urgency. */
export function ProtocolList({ protocols }: { protocols: ProposedProtocol[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  if (!protocols.length) return null;
  return (
    <div className="mt-2 border-t border-cyan-500/20 pt-2 space-y-2" data-testid="proposed-protocols">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300">Proposed protocols</div>
      {protocols.map((p, pi) => {
        const st = bandStyle(p.severity);
        return (
          <div key={p.id} className={`border ${p.onboard ? "border-rose-400/50 bg-rose-500/[0.06]" : "border-cyan-500/20 bg-[#040c18]"} p-2`}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[12px] font-semibold text-white leading-snug">
                <span className="text-slate-400 font-mono mr-1">{pi + 1}.</span>
                {p.title}
              </div>
              <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-mono tracking-wider border ${st.text} ${st.border} ${st.bg}`}>{st.label}</span>
            </div>
            <div className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">{p.crew}</div>
            {p.act_within_min != null && p.earth_reply_min != null && (
              <div className={`mt-1 text-[11px] font-mono ${p.onboard ? "text-rose-200" : "text-slate-300"}`}>
                Act within {fmt(p.act_within_min)} · Earth reply {p.earth_reply_min.toFixed(1)} min
                {p.onboard ? " → START ON BOARD NOW" : " → time to confirm with Earth"}
              </div>
            )}
            <p className="mt-1 text-[11px] text-slate-300 leading-snug">{p.why}</p>
            <ol className="mt-1.5 space-y-1">
              {p.steps.map((step, i) => {
                const k = `${p.id}#${i}`;
                return (
                  <li key={k}>
                    <label className="flex gap-1.5 items-start cursor-pointer text-[11px] leading-snug">
                      <input
                        type="checkbox"
                        checked={!!done[k]}
                        onChange={() => setDone((d) => ({ ...d, [k]: !d[k] }))}
                        className="mt-0.5 accent-cyan-400"
                      />
                      <span className={done[k] ? "text-slate-500 line-through" : "text-slate-100"}>
                        <span className="text-cyan-400 font-mono mr-1">{i + 1}</span>
                        {step}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
            <div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-slate-500">{p.source}</div>
          </div>
        );
      })}
      <div className="text-[9px] font-mono tracking-wider text-slate-500">DECISION SUPPORT FOR THE CREW MEDICAL OFFICER · NOT A DIAGNOSIS · SYNTHETIC CREW</div>
    </div>
  );
}
