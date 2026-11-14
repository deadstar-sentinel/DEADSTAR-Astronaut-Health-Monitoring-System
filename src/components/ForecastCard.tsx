import { useEffect, useState } from "react";
import type { AnatomyId } from "../data/anatomyCatalog.ts";

/**
 * Spaceflight-risk forecast for the selected structure, plus the light-delay decision:
 * if the problem crosses its threshold before Earth could answer, SENTINEL acts on board.
 * Demo values are SIMULATED (labelled on the card); risk names follow NASA HRP.
 */
type Status = "crit" | "cau" | "nom";
interface Forecast {
  risk: string;          // NASA HRP risk this maps to
  status: Status;
  p: number;             // probability of crossing threshold within the horizon
  horizon: string;
  tttHours: number;      // time to threshold
  signals: string[];
  action: string;
}

const F: Partial<Record<AnatomyId, Forecast>> = {
  brain: { risk: "Cognitive & behavioural conditions (sleep loss, fatigue)", status: "crit", p: 71, horizon: "6 h", tttHours: 0.42,
    signals: ["Reaction time +18 % vs baseline (PVT)", "Sleep 4.9 h / 24 h"], action: "Stand down from EVA; 90-min rest window." },
  nervous: { risk: "Spaceflight-associated neuro-ocular syndrome (SANS)", status: "cau", p: 34, horizon: "30 d", tttHours: 310,
    signals: ["Optic disc swelling trend", "Intra-ocular pressure 19 mmHg"], action: "Add thigh-cuff sessions; repeat OCT in 7 d." },
  heart: { risk: "Cardiovascular adaptations (orthostatic intolerance)", status: "nom", p: 18, horizon: "7 d", tttHours: 160,
    signals: ["Resting HR 64 bpm", "QTc 418 ms"], action: "Keep fluid-loading protocol before re-entry." },
  circulatory: { risk: "Space anaemia (red-cell loss)", status: "cau", p: 37, horizon: "14 d", tttHours: 220,
    signals: ["Haemoglobin −6 % since launch", "Breath CO ↑ (haemolysis marker)"], action: "Iron-rich menu; recheck blood panel in 5 d." },
  lungs: { risk: "Cabin CO₂ exposure", status: "nom", p: 12, horizon: "24 h", tttHours: 30,
    signals: ["End-tidal CO₂ 41 mmHg", "Cabin ppCO₂ 2.6 mmHg (limit 3.0)"], action: "Watch scrubber; no change needed." },
  kidneys: { risk: "Renal stone formation", status: "cau", p: 29, horizon: "30 d", tttHours: 410,
    signals: ["Urine calcium ↑ 22 %", "Fluid intake 1.9 L/day"], action: "Raise fluids to 2.5 L/day; potassium citrate." },
  skeletal: { risk: "Bone loss (1–1.5 % per month)", status: "cau", p: 58, horizon: "30 d", tttHours: 260,
    signals: ["Bone marker NTx ↑", "Resistive exercise 4/7 days"], action: "Restore daily ARED sessions." },
  spine: { risk: "Back pain & disc changes", status: "nom", p: 22, horizon: "14 d", tttHours: 300,
    signals: ["Height +2.1 cm (spinal unloading)"], action: "Core routine; recheck in 7 d." },
  muscular: { risk: "Muscle atrophy & reduced strength", status: "cau", p: 41, horizon: "30 d", tttHours: 340,
    signals: ["Calf volume −4 %", "Peak torque −7 %"], action: "Add resistive load; protein 1.6 g/kg." },
  stomach: { risk: "Nutrition & GI adaptation", status: "nom", p: 9, horizon: "7 d", tttHours: 400,
    signals: ["Intake 2,750 kcal/day"], action: "No change." },
  liver: { risk: "Drug stability & metabolism", status: "nom", p: 7, horizon: "30 d", tttHours: 900,
    signals: ["Pharmacy shelf-life check passed"], action: "No change." },
  pancreas: { risk: "Glucose regulation", status: "nom", p: 8, horizon: "7 d", tttHours: 600,
    signals: ["Fasting glucose 5.1 mmol/L"], action: "No change." },
  small_intestine: { risk: "Immune & microbiome changes", status: "nom", p: 14, horizon: "14 d", tttHours: 500,
    signals: ["Latent-virus shedding: none"], action: "No change." },
  large_intestine: { risk: "Immune & microbiome changes", status: "nom", p: 14, horizon: "14 d", tttHours: 500,
    signals: ["Latent-virus shedding: none"], action: "No change." },
};

const STYLE: Record<Status, { label: string; cls: string; bar: string }> = {
  crit: { label: "CRITICAL", cls: "text-rose-200 border-rose-400/60 bg-rose-500/15", bar: "bg-rose-400" },
  cau: { label: "WATCH", cls: "text-amber-200 border-amber-400/60 bg-amber-500/15", bar: "bg-amber-400" },
  nom: { label: "NOMINAL", cls: "text-emerald-200 border-emerald-400/50 bg-emerald-500/10", bar: "bg-emerald-400" },
};

const fmtH = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} d`);

/** Earth–Mars one-way light time today, from the server if it offers it; 11.0 min fallback (14 Nov 2026). */
function useOneWayMinutes() {
  const [min, setMin] = useState(11.0);
  useEffect(() => {
    fetch("/api/earthlink")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const s = d?.light?.owlt_s ?? d?.one_way_s;
        if (typeof s === "number" && s > 0) setMin(s / 60);
      })
      .catch(() => {});
  }, []);
  return min;
}

export function ForecastCard({ organId }: { organId: AnatomyId }) {
  const oneWay = useOneWayMinutes();
  const f = F[organId];
  if (!f) return null;
  const st = STYLE[f.status];
  const earthReplyMin = oneWay * 2 + 10;                 // round trip + 10 min for the flight surgeon
  const actOnBoard = f.tttHours * 60 < earthReplyMin;

  return (
    <div data-testid="forecast-card" className="p-3 border border-cyan-400/30 bg-[#051327] space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300">Forecast</span>
        <span className={`px-2 py-0.5 text-[10px] font-mono tracking-wider border ${st.cls}`}>{st.label}</span>
      </div>
      <div className="text-sm text-white leading-snug">{f.risk}</div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] font-mono uppercase text-slate-400">Risk in {f.horizon}</div>
          <div className="text-2xl font-semibold tabular-nums text-white">{f.p}%</div>
          <div className="h-1.5 mt-1 bg-slate-800">
            <div className={`h-full ${st.bar}`} style={{ width: `${f.p}%` }} />
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-slate-400">Time to threshold</div>
          <div className="text-2xl font-semibold tabular-nums text-white">{fmtH(f.tttHours)}</div>
        </div>
      </div>

      <div className={`p-2 border text-xs ${actOnBoard ? "border-rose-400/60 bg-rose-500/10" : "border-cyan-500/25 bg-[#040c18]"}`}>
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-300">
          Earth reply: {earthReplyMin.toFixed(0)} min ({oneWay.toFixed(1)} min each way + 10 min)
        </div>
        <div className={`mt-0.5 font-semibold ${actOnBoard ? "text-rose-200" : "text-cyan-100"}`}>
          {actOnBoard ? "▲ ACT ON BOARD — Earth can't answer in time" : "Consult Earth — there is time"}
        </div>
      </div>

      <ul className="space-y-1 text-xs text-slate-200">
        {f.signals.map((s) => (
          <li key={s} className="flex gap-1.5"><span className="text-cyan-400">•</span>{s}</li>
        ))}
      </ul>
      <div className="text-xs"><span className="text-cyan-300 font-mono text-[10px] uppercase">Action · </span><span className="text-white">{f.action}</span></div>
      <div className="text-[9px] font-mono tracking-wider text-slate-500">SIMULATED CREW · DECISION SUPPORT, NOT DIAGNOSIS</div>
    </div>
  );
}
