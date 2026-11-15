import type { AnatomyId } from "../data/anatomyCatalog.ts";
import { Num } from "./Num.tsx";
import { ORGAN_LINK, RISK_SIGNAL, anatomyForRisk, bandStyle, fmtProb, useFetch, useSentinel, type CrewDetail, type Forecast } from "./api.tsx";

/** History (solid), forecast mean (dashed), 80/95 % bands, NOW rule and threshold — straight from /api/forecast. */
const clean = (a: (number | null)[] | undefined): number[] => {
  let last = 0;
  return (a ?? []).map((v) => (typeof v === "number" && Number.isFinite(v) ? (last = v) : last));
};

function ForecastChart({ f: raw, decimals }: { f: Forecast; decimals: number }) {
  const f = { ...raw, history: clean(raw.history), mean: clean(raw.mean), lo80: clean(raw.lo80), hi80: clean(raw.hi80), lo95: clean(raw.lo95), hi95: clean(raw.hi95) };
  if (!f.history.length || !f.mean.length) return null;
  const W = 300;
  const H = 112;
  const P = { l: 34, r: 6, t: 8, b: 16 };
  const hist = f.history.slice(-Math.max(8, Math.min(f.history.length, f.mean.length * 2)));
  const n = hist.length + f.mean.length;
  const all = [...hist, ...f.lo95, ...f.hi95, ...(f.threshold ? [f.threshold.value] : [])].filter(Number.isFinite);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const x = (i: number) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const path = (vals: number[], off: number) => vals.map((v, i) => `${i ? "L" : "M"}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = (a: number[], b: number[], off: number) =>
    `${path(a, off)}${b.map((_, i) => `L${x(b.length - 1 - i + off).toFixed(1)},${y(b[b.length - 1 - i]).toFixed(1)}`).join("")}Z`;
  const now = hist.length - 1;
  const unitTick = f.resolution === "hour" ? "h" : "d";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Forecast of ${f.signal}`}>
      <path d={area(f.lo95, f.hi95, hist.length)} fill="rgba(34,211,238,0.12)" />
      <path d={area(f.lo80, f.hi80, hist.length)} fill="rgba(34,211,238,0.22)" />
      <path d={path(hist, 0)} fill="none" stroke="#e2f6ff" strokeWidth={1.4} />
      <path d={path([hist[now], ...f.mean], now)} fill="none" stroke="#22d3ee" strokeWidth={1.6} strokeDasharray="4 3" />
      {f.threshold && (
        <>
          <line x1={P.l} x2={W - P.r} y1={y(f.threshold.value)} y2={y(f.threshold.value)} stroke="#fb7185" strokeDasharray="3 3" />
          <text x={W - P.r} y={y(f.threshold.value) - 3} textAnchor="end" fontSize={8} fill="#fda4af">{f.threshold.label}</text>
        </>
      )}
      <line x1={x(now)} x2={x(now)} y1={P.t} y2={H - P.b} stroke="rgba(255,255,255,0.35)" />
      <text x={x(now)} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">NOW</text>
      <text x={W - P.r} y={H - 4} textAnchor="end" fontSize={8} fill="#94a3b8">+{f.mean.length}{unitTick}</text>
      <text x={P.l - 4} y={P.t + 6} textAnchor="end" fontSize={8} fill="#94a3b8">{hi.toFixed(decimals)}</text>
      <text x={P.l - 4} y={H - P.b} textAnchor="end" fontSize={8} fill="#94a3b8">{lo.toFixed(decimals)}</text>
    </svg>
  );
}

export function ForecastCard({ organId }: { organId: AnatomyId }) {
  const { crewId, mission, meta, earthReplyMin, focusRisk, missionId, scenarioId } = useSentinel();
  const base = ORGAN_LINK[organId];
  // An alert's "Show me" pins its exact risk (e.g. immune -> fever forecast) when it belongs to this structure.
  const pinned = focusRisk && meta && anatomyForRisk(focusRisk, meta.risks) === organId ? focusRisk : null;
  const organKey = pinned ? meta?.risks.find((r) => r.id === pinned)?.organ ?? base.organ : base.organ;
  const link = pinned && RISK_SIGNAL[pinned] ? { organ: organKey, ...RISK_SIGNAL[pinned] } : base;
  const detail = useFetch<CrewDetail>(`/api/crew/${crewId}?mission=${missionId}&scenario=${scenarioId}`);
  const fc = useFetch<Forecast>(
    `/api/forecast/${crewId}/${link.signal}?horizon=${link.horizon}&mission=${missionId}&scenario=${scenarioId}`,
  );
  const crew = mission?.crew.find((c) => c.id === crewId);
  const organEntry = organKey ? detail?.organs[organKey] : undefined;
  const riskId = pinned ?? meta?.risks.find((r) => r.organ === organKey && r.name === organEntry?.risk)?.id;
  const riskDetail = riskId ? detail?.risks[riskId] : undefined;
  const organ = riskDetail
    ? {
        risk: meta?.risks.find((r) => r.id === riskId)?.name ?? organEntry?.risk ?? riskId ?? "",
        score: riskDetail.score,
        band: riskDetail.band ?? (riskDetail.score >= 60 ? "act" : riskDetail.score >= 30 ? "watch" : "nominal"),
        driver: riskDetail.drivers[0] ?? organEntry?.driver ?? "",
      }
    : organEntry;
  const rec = riskDetail?.recommendation;
  const sig = meta?.signals[link.signal];
  const alert = mission?.alerts.find((a) => a.crew === crewId && a.risk === riskId);
  const st = bandStyle(organ?.band);

  // Light-cone rule: act on board when the problem arrives before Earth's answer could.
  const crossH = fc && fc.threshold ? fc.threshold.mean_crosses_in_h : null;
  const actWithin: number | null = alert?.act_within_min ?? (typeof crossH === "number" ? crossH * 60 : null);
  const onBoard = actWithin != null && earthReplyMin != null && actWithin < earthReplyMin;

  return (
    <div data-testid="forecast-card" key={`${crewId}:${link.signal}:${missionId}`} className="sx-rise border border-cyan-400/30 bg-[#051327] shadow-[0_0_30px_rgba(0,140,255,0.12)]">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300">
          SENTINEL forecast · {crew?.name ?? crewId}
        </span>
        {organ && <span className={`px-2 py-0.5 text-[10px] font-mono tracking-wider border ${st.text} ${st.border} ${st.bg}`}>{st.label}</span>}
      </div>

      <div className="px-3 pt-1.5 space-y-2">
        {organ ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm text-white leading-snug">{organ.risk}</div>
              <div className="text-xl font-semibold tabular-nums text-white"><Num value={Math.round(organ.score)} /><span className="text-[10px] text-slate-400">/100</span></div>
            </div>
            <div className="h-1 bg-slate-800"><div className={`sx-grow h-full ${st.dot}`} style={{ width: `${Math.min(100, organ.score)}%` }} /></div>
            <div className="text-[11px] text-slate-300">Driver: {organ.driver}</div>
          </>
        ) : (
          <div className="text-[11px] text-slate-400">No HRP risk is modelled for this structure; showing its most relevant signal.</div>
        )}
      </div>

      {fc && (
        <div className="px-2 pt-2">
          <div className="px-1 flex justify-between text-[10px] font-mono uppercase text-slate-400">
            <span>{sig?.label ?? link.signal}{sig?.unit ? ` (${sig.unit})` : ""}</span>
            <span>80 / 95 % bands</span>
          </div>
          <div className="sx-reveal"><ForecastChart f={fc} decimals={sig?.decimals ?? 1} /></div>
          {fc.threshold?.peak_prob != null && (
            <div className="px-1 text-[11px] text-slate-200">
              P({fc.threshold.label}) peaks at <b className="text-white">{fmtProb(fc.threshold.peak_prob)}</b>
              {fc.threshold.mean_crosses_in_h != null && <> · mean crosses in <b className="text-white">{fc.threshold.mean_crosses_in_h} h</b></>}
            </div>
          )}
        </div>
      )}

      {actWithin != null && earthReplyMin != null && (
        <div className={`sx-rise mx-3 mt-2 p-2 border text-xs ${onBoard ? "border-rose-400/60 bg-rose-500/10" : "border-cyan-500/25 bg-[#040c18]"}`}>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-300">
            Act within {actWithin < 120 ? `${Math.round(actWithin)} min` : `${(actWithin / 60).toFixed(0)} h`} · Earth reply {earthReplyMin.toFixed(1)} min
          </div>
          <div className={`mt-0.5 font-semibold ${onBoard ? "text-rose-200" : "text-cyan-100"}`}>
            {onBoard ? "▲ ACT ON BOARD — Earth's answer arrives too late" : "Consult Earth — there is time for the flight surgeon"}
          </div>
        </div>
      )}

      {rec && (
        <div className="px-3 pt-2 text-xs">
          <span className="text-cyan-300 font-mono text-[10px] uppercase">Recommended · </span>
          <span className="text-white">{rec}</span>
        </div>
      )}
      <div className="px-3 py-2 text-[9px] font-mono tracking-wider text-slate-500">
        {crew?.source === "synthetic" ? "SYNTHETIC CREW · " : ""}DECISION SUPPORT, NOT DIAGNOSIS
      </div>
    </div>
  );
}
