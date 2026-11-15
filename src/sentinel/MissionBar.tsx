import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, BookOpen, ExternalLink, Film, QrCode, X } from "lucide-react";
import type { AnatomyId } from "../data/anatomyCatalog.ts";
import { anatomyForRisk, bandStyle, fmtLight, useFetch, useSentinel } from "./api.tsx";
import { Num } from "./Num.tsx";

interface ValidationSummary { summary: { kind: string; h: number; unit: string; skill_median: number | null; coverage80: number | null; coverage95: number | null }[] }

function Stat({ label, warn = false, children }: { label: string; warn?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col leading-tight shrink-0">
      <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap">{label}</span>
      <span className={`text-[12px] font-mono tabular-nums whitespace-nowrap ${warn ? "text-amber-200" : "text-white"}`}>{children}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sx-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="sx-pop w-full max-w-2xl max-h-[85vh] overflow-y-auto med-scroll border border-cyan-400/40 bg-[#051020] p-4 shadow-[0_0_80px_rgba(0,140,255,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-[0.14em] uppercase text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** QR to the phone PVT test (/astronaut): judges scan it, take the reaction test, and appear in the crew data live. */
export function QrPanel() {
  const [svg, setSvg] = useState<string | null>(null);
  const url = `${window.location.origin}/astronaut`;
  useEffect(() => {
    type QrLib = (t: number, l: string) => { addData: (s: string) => void; make: () => void; createSvgTag: (o: { cellSize: number; margin: number; scalable: boolean }) => string };
    const w = window as unknown as { qrcode?: QrLib };
    const draw = () => {
      if (!w.qrcode) return;
      const q = w.qrcode(0, "M");
      q.addData(url);
      q.make();
      setSvg(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
    };
    if (w.qrcode) return draw();
    const s = document.createElement("script");
    s.src = "/static/vendor/qrcode.js";
    s.onload = draw;
    document.head.appendChild(s);
  }, [url]);
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center">
      <div className="w-48 h-48 bg-white p-2 shrink-0 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg ?? "" }} />
      <div className="text-sm text-slate-200 space-y-2">
        <p><b className="text-white">Be the 5th crew member.</b> Scan to take the 3-minute psychomotor vigilance test (PVT) NASA uses for fatigue. Your result streams into LIFELINE live.</p>
        <p className="font-mono text-[11px] text-cyan-300 break-all">{url}</p>
      </div>
    </div>
  );
}

function SourcesPanel() {
  const { meta } = useSentinel();
  const { missionId } = useSentinel();
  const val = useFetch<ValidationSummary>(`/api/validation?mission=${missionId}`);
  return (
    <div className="space-y-4 text-xs">
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300 mb-1.5">Is the forecaster honest? (back-tested on this mission's own data)</h3>
        {val ? (
          <table className="w-full text-left tabular-nums">
            <thead className="text-slate-400 font-mono text-[10px] uppercase">
              <tr><th className="py-1">Horizon</th><th>Skill vs naive</th><th>80 % band covers</th><th>95 % band covers</th></tr>
            </thead>
            <tbody>
              {val.summary.map((r) => (
                <tr key={`${r.kind}${r.h}`} className="border-t border-cyan-500/10 text-slate-200">
                  <td className="py-1">{r.h} {r.unit}</td>
                  <td>{r.skill_median == null ? "—" : `${Math.round(r.skill_median * 100)} %`}</td>
                  <td>{r.coverage80 == null ? "—" : `${Math.round(r.coverage80 * 100)} %`}</td>
                  <td>{r.coverage95 == null ? "—" : `${Math.round(r.coverage95 * 100)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-400">Loading back-test…</p>
        )}
        <p className="mt-1 text-[10px] text-slate-500">Well-calibrated bands cover close to 80 % and 95 %. Skill above 0 % beats "tomorrow = today".</p>
      </section>
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300 mb-1.5">Data sources</h3>
        <ul className="space-y-1.5">
          {meta && Object.entries(meta.sources).map(([k, s]) => (
            <li key={k}>
              <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan-200 hover:text-white underline-offset-2 hover:underline">{s.title}</a>
              {s.note && <div className="text-slate-400">{s.note}</div>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300 mb-1.5">NASA HRP risks modelled</h3>
        <div className="flex flex-wrap gap-1.5">
          {meta?.risks.map((r) => (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="px-2 py-0.5 border border-cyan-500/25 text-slate-200 hover:border-cyan-300 hover:text-white">{r.name}</a>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MissionBar({ onOpenOrgan }: { onOpenOrgan: (id: AnatomyId) => void }) {
  const { mission, meta, crewId, setCrewId, earthReplyMin, setFocusRisk, missionId, setMissionId } = useSentinel();
  const [modal, setModal] = useState<"qr" | "sources" | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!mission) {
    return <div className="h-12 shrink-0 bg-[#040d1c] border-b border-cyan-500/15 px-3 flex items-center text-[11px] font-mono text-slate-400">Connecting to LIFELINE engine…</div>;
  }
  const crew = mission.crew.find((c) => c.id === crewId) ?? mission.crew[0];
  const co2 = mission.env.co2;
  const dose = crew?.daily.dose;
  const top = mission.alerts.find((a) => a.severity === "act" && a.id !== dismissed);
  const onBoard = top && top.act_within_min != null && earthReplyMin != null && top.act_within_min < earthReplyMin;
  const btn = "flex items-center gap-1 px-2 py-1 border border-cyan-500/30 text-[11px] font-mono uppercase text-cyan-100 hover:border-cyan-300 hover:bg-cyan-400/10 whitespace-nowrap";
  const missions = meta?.missions ?? [];

  return (
    <>
      <div className="sx-drop shrink-0 bg-[#040d1c] border-b border-cyan-500/15 px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 z-30">
        <div className="flex flex-col leading-tight shrink-0">
          {missions.length > 1 ? (
            <select
              aria-label="Mission"
              value={missionId}
              onChange={(e) => setMissionId(e.target.value)}
              className="bg-transparent text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-300 outline-none cursor-pointer hover:text-white -ml-1"
            >
              {missions.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#040d1c] text-white">
                  {m.short}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-cyan-400">{mission.mission.short}</span>
          )}
          <span className="text-[12px] font-mono text-white whitespace-nowrap">{mission.met.label} · day {mission.mission.current_day}/{mission.mission.duration_days}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none]" role="tablist" aria-label="Crew member">
          {mission.crew.map((c) => {
            const s = bandStyle(c.status);
            const on = c.id === crew?.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setCrewId(c.id)}
                title={`${c.name}, ${c.role}: health index ${Math.round(c.health_index)}`}
                className={`flex items-center gap-1.5 px-2 py-1 max-sm:py-2 max-sm:px-2.5 border text-[11px] font-mono uppercase ${on ? "border-cyan-300 bg-cyan-400/15 text-white shadow-[0_0_14px_rgba(34,211,238,0.25)]" : "border-cyan-500/20 text-slate-300 hover:border-cyan-300 hover:text-white"}`}
              >
                <span className={`w-2 h-2 rounded-full ${s.dot} ${c.status === "act" ? "animate-pulse" : ""}`} />
                {c.name.split(" ").slice(-1)[0]}
                <span className="text-slate-400"><Num value={Math.round(c.health_index)} /></span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <Stat label="Earth link · one way" warn={mission.light.blackout}>{mission.light.blackout ? "BLACKOUT" : fmtLight(mission.light.owlt_s)}</Stat>
          {co2 && <Stat label="Cabin CO₂" warn={!!co2.normal && co2.now > co2.normal[1]}><Num value={co2.now} decimals={2} /> {co2.unit}</Stat>}
          {dose != null && <Stat label={`${crew.name.split(" ").slice(-1)[0]} dose / limit`} warn={dose > 400}><Num value={Math.round(dose)} /> / 600 mSv</Stat>}
          {mission.space_weather.summary?.label && (
            <span className="hidden xl:block">
              <Stat label={`Space weather${mission.space_weather.live ? " · NOAA live" : ""}`} warn={mission.space_weather.summary.level > 0}>{mission.space_weather.summary.label}</Stat>
            </span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 ml-auto">
          <span className="hidden 2xl:inline px-1.5 py-0.5 border border-amber-400/50 text-[9px] font-mono tracking-wider text-amber-200 whitespace-nowrap">SYNTHETIC CREW</span>
          <button type="button" onClick={() => setModal("sources")} className={btn}><BookOpen className="w-3.5 h-3.5" />Sources</button>
          <button type="button" onClick={() => setModal("qr")} className={btn}><QrCode className="w-3.5 h-3.5" />Join</button>
          <button
            type="button"
            title="Replay the cinematic intro"
            onClick={() => {
              try {
                sessionStorage.removeItem("sentinel-entered");
              } catch {
                /* ignore */
              }
              window.location.assign(window.location.pathname);
            }}
            className={btn}
          >
            <Film className="w-3.5 h-3.5" />Intro
          </button>
          <a href="/console" target="_blank" rel="noreferrer" className={btn}>Console<ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>

      {top && (
        <div key={top.id} className={`sx-alert relative overflow-hidden shrink-0 px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b text-xs z-30 ${onBoard ? "bg-rose-500/15 border-rose-400/40" : "bg-amber-500/10 border-amber-400/30"}`}>
          <AlertTriangle className={`w-4 h-4 shrink-0 animate-pulse ${onBoard ? "text-rose-300" : "text-amber-300"}`} />
          <span className="font-semibold text-white">{top.title}</span>
          {top.act_within_min != null && earthReplyMin != null && (
            <span className="font-mono text-[11px] text-slate-200">
              act within {top.act_within_min < 120 ? `${top.act_within_min} min` : `${Math.round(top.act_within_min / 60)} h`} · Earth reply {earthReplyMin.toFixed(1)} min
              <b className={`ml-2 ${onBoard ? "text-rose-200" : "text-cyan-200"}`}>{onBoard ? "→ LIFELINE ACTS ON BOARD" : "→ time to consult Earth"}</b>
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (top.crew) setCrewId(top.crew);
                setFocusRisk(top.risk);
                const a = meta ? anatomyForRisk(top.risk, meta.risks) : null;
                onOpenOrgan(a ?? "circulatory");
              }}
              className="px-2 py-0.5 border border-white/40 text-[11px] font-mono uppercase text-white hover:bg-white/10"
            >
              Show me
            </button>
            <button type="button" onClick={() => setDismissed(top.id)} aria-label="Dismiss alert" className="p-0.5 text-slate-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </span>
        </div>
      )}

      {modal === "qr" && <Modal title="Join the crew" onClose={() => setModal(null)}><QrPanel /></Modal>}
      {modal === "sources" && <Modal title="Sources, datasets & honesty check" onClose={() => setModal(null)}><SourcesPanel /></Modal>}
    </>
  );
}
