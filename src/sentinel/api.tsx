import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AnatomyId } from "../data/anatomyCatalog.ts";

/* ----------------------------------------------------------------- engine types (server/engine) */
export type Band = "nominal" | "watch" | "act";

export interface CrewSummary {
  id: string;
  name: string;
  role: string;
  short: string;
  health_index: number;
  status: Band | string;
  source: string;
  daily: Record<string, number>;
  vitals?: Record<string, number>;
}

export interface Alert {
  id: string;
  crew: string | null;
  severity: Band | string;
  risk: string;
  title: string;
  detail: string;
  act_within_min?: number;
  earth_reply_min?: number;
  autonomous?: boolean;
}

export interface MissionState {
  mission: { id: string; name: string; short: string; current_day: number; duration_days: number; dose_msv_day: number };
  met: { label: string };
  light: { owlt_s: number | null; method: string; blackout: boolean; distance_au?: number };
  ship_vs_body: { verdict: string; headline: string };
  crew: CrewSummary[];
  alerts: Alert[];
  env: { co2?: { now: number; unit: string; normal?: [number, number] } };
  space_weather: { summary?: { level: number; label: string; reasons?: string[] } | null; live?: boolean; goes?: number | null };
}

export interface OrganRisk { score: number; band: Band | string; risk: string; driver: string }
export interface RiskDetail { score: number; drivers: string[]; recommendation: string; band?: string }
export interface CrewDetail {
  summary: CrewSummary;
  organs: Record<string, OrganRisk>;
  risks: Record<string, RiskDetail>;
}

export interface Forecast {
  signal: string;
  resolution: "hour" | "day";
  horizon: number;
  history: number[];
  mean: number[];
  lo80: number[];
  hi80: number[];
  lo95: number[];
  hi95: number[];
  threshold?: { value: number; dir: "above" | "below"; label: string; peak_prob?: number; mean_crosses_in_h?: number | null } | null;
}

export interface Source { title: string; url: string; note?: string }
export interface HrpRisk { id: string; name: string; group: string; url: string; organ: string }
export interface Meta {
  missions?: { id: string; name: string; short: string }[];
  sources: Record<string, Source>;
  risks: HrpRisk[];
  signals: Record<string, { label: string; unit: string; normal?: [number, number]; decimals?: number }>;
}

/* ----------------------------------------------------------------- anatomy -> engine mapping */
// Engine organ keys come from HRP_RISKS[].organ; signals from SIGNALS (server/engine/constants.js).
export const ORGAN_LINK: Record<AnatomyId, { organ: string | null; signal: string; horizon: string }> = {
  brain: { organ: "brain", signal: "sleep_h", horizon: "7d" },
  nervous: { organ: "eyes", signal: "onsd", horizon: "30d" },
  heart: { organ: "heart", signal: "hr", horizon: "24h" },
  circulatory: { organ: "heart", signal: "plasma", horizon: "30d" },
  lungs: { organ: "lungs", signal: "spo2", horizon: "24h" },
  liver: { organ: "gut", signal: "mass", horizon: "30d" },
  stomach: { organ: "gut", signal: "mass", horizon: "30d" },
  pancreas: { organ: "gut", signal: "glucose", horizon: "7d" },
  small_intestine: { organ: "gut", signal: "mass", horizon: "30d" },
  large_intestine: { organ: "gut", signal: "mass", horizon: "30d" },
  kidneys: { organ: null, signal: "plasma", horizon: "30d" },
  spine: { organ: "spine", signal: "bmd", horizon: "30d" },
  skeletal: { organ: "hips", signal: "bmd", horizon: "30d" },
  muscular: { organ: "legs", signal: "muscle", horizon: "30d" },
};

/** Best signal + horizon to forecast for each HRP risk id. */
export const RISK_SIGNAL: Record<string, { signal: string; horizon: string }> = {
  immune: { signal: "temp", horizon: "24h" },
  sans: { signal: "onsd", horizon: "30d" },
  sleep: { signal: "sleep_h", horizon: "7d" },
  behavior: { signal: "cognition", horizon: "7d" },
  teamwork: { signal: "cognition", horizon: "7d" },
  systems: { signal: "pvt", horizon: "7d" },
  bone: { signal: "bmd", horizon: "30d" },
  dynamic: { signal: "bmd", horizon: "30d" },
  cardio: { signal: "plasma", horizon: "30d" },
  hypoxia: { signal: "spo2", horizon: "24h" },
  fitness: { signal: "muscle", horizon: "30d" },
  cancer: { signal: "dose", horizon: "30d" },
  nutrition: { signal: "mass", horizon: "30d" },
  microbe: { signal: "temp", horizon: "24h" },
};

/** Which anatomy structure to open for an alert's HRP risk id. */
export function anatomyForRisk(riskId: string, risks: HrpRisk[]): AnatomyId | null {
  const organ = risks.find((r) => r.id === riskId)?.organ;
  if (!organ) return null;
  const hit = (Object.keys(ORGAN_LINK) as AnatomyId[]).find((a) => ORGAN_LINK[a].organ === organ);
  return hit ?? (organ === "lymph" ? "circulatory" : null);
}

/** Probabilities from a model are never exactly 0 or 1: show the extremes as "<1%" / ">99%". */
export function fmtProb(p: number | null | undefined): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/* ----------------------------------------------------------------- fetch helpers */
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export function useFetch<T>(url: string | null, refreshMs = 0, keepStale = false): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = () => getJson<T>(url).then((d) => alive && setData(d)).catch(() => {});
    if (!keepStale) setData(null);
    load();
    const id = refreshMs ? window.setInterval(load, refreshMs) : 0;
    return () => {
      alive = false;
      if (id) window.clearInterval(id);
    };
  }, [url, refreshMs, keepStale]);
  return data;
}

/* ----------------------------------------------------------------- shared context */
interface SentinelCtx {
  mission: MissionState | null;
  meta: Meta | null;
  crewId: string;
  setCrewId: (id: string) => void;
  earthReplyMin: number | null;   // round trip + ground response, from the engine
  missionId: string;              // this client's mission (never the server-wide default)
  setMissionId: (id: string) => void;
  scenarioId: string;             // this client's scenario, shared with /console in this browser
  focusRisk: string | null;       // set by an alert's "Show me": the card opens on exactly that risk
  setFocusRisk: (id: string | null) => void;
}
const Ctx = createContext<SentinelCtx | null>(null);

/* Mission + scenario are per browser and shared with the /console page (same key), so both
   pages always show the same crew state and no visitor changes what other judges see. */
export const VIEW_KEY = "sentinel-view";
interface SharedView {
  mission: string;
  scenario: string;
}
export function readSharedView(): SharedView {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}") as Partial<SharedView>;
    return {
      mission: typeof v.mission === "string" ? v.mission : "mars_transit",
      scenario: typeof v.scenario === "string" ? v.scenario : "baseline",
    };
  } catch {
    return { mission: "mars_transit", scenario: "baseline" };
  }
}

export function SentinelProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<SharedView>(readSharedView);
  const missionId = view.mission;
  const scenarioId = view.scenario;
  const setMissionId = useCallback((id: string) => {
    setView((v) => {
      const next = { ...v, mission: id };
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(next));
      } catch {
        /* private mode: this tab only */
      }
      return next;
    });
  }, []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === VIEW_KEY) setView(readSharedView());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const mission = useFetch<MissionState>(`/api/state?mission=${missionId}&scenario=${scenarioId}`, 20000, true);
  const meta = useFetch<Meta>("/api/meta");
  const [crewId, setCrewId] = useState("mori");
  const [focusRisk, setFocusRisk] = useState<string | null>(null);
  const fromAlert = mission?.alerts.find((a) => typeof a.earth_reply_min === "number")?.earth_reply_min;
  const owlt = mission?.light.owlt_s;
  const earthReplyMin = fromAlert ?? (typeof owlt === "number" ? (2 * owlt) / 60 + 30 : null);
  const crewIds = mission?.crew.map((c) => c.id).join(",") ?? "";
  useEffect(() => {
    if (crewIds && !crewIds.split(",").includes(crewId)) setCrewId(crewIds.split(",")[0]);
  }, [crewIds, crewId]);
  return (
    <Ctx.Provider value={{ mission, meta, crewId, setCrewId, earthReplyMin, missionId, setMissionId, scenarioId, focusRisk, setFocusRisk }}>{children}</Ctx.Provider>
  );
}

export function useSentinel(): SentinelCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSentinel outside SentinelProvider");
  return c;
}

export const BAND_STYLE: Record<string, { label: string; text: string; border: string; bg: string; dot: string }> = {
  act: { label: "ACT", text: "text-rose-200", border: "border-rose-400/60", bg: "bg-rose-500/15", dot: "bg-rose-400" },
  watch: { label: "WATCH", text: "text-amber-200", border: "border-amber-400/60", bg: "bg-amber-500/15", dot: "bg-amber-400" },
  nominal: { label: "NOMINAL", text: "text-emerald-200", border: "border-emerald-400/50", bg: "bg-emerald-500/10", dot: "bg-emerald-400" },
};
export const bandStyle = (b: string | undefined) => BAND_STYLE[b ?? "nominal"] ?? BAND_STYLE.nominal;

/** One-way light time for humans: seconds near Earth, minutes in deep space. */
export function fmtLight(owltS: number | null | undefined): string {
  if (owltS == null) return "—";
  return owltS < 90 ? `${owltS.toFixed(1)} s` : `${(owltS / 60).toFixed(1)} min`;
}
