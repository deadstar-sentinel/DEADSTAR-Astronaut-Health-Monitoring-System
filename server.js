import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import multer from "multer";

import * as analysis from "./server/engine/analysis.js";
import * as content from "./server/engine/content.js";
import * as copilot from "./server/engine/copilot.js";
import * as ingest from "./server/engine/ingest.js";
import * as orbits from "./server/engine/orbits.js";
import * as spaceweather from "./server/engine/spaceweather.js";
import * as whatif from "./server/engine/whatif.js";
import * as fc from "./server/engine/forecast.js";
import { answerMedicalQuery } from "./server/assistant.js";
import {
  DEFAULT_MISSION,
  ENV_SIGNALS,
  HRP_RISKS,
  MISSIONS,
  SCENARIOS,
  SIGNALS,
  SOURCES,
  HOURLY_SIGNALS,
  FORECAST_DAILY,
} from "./server/engine/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const STATIC = path.join(ROOT, "static");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");

const app = express();
app.use(compression({ threshold: 1200 }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(DIST));
app.use("/static", express.static(STATIC));
app.use("/models", express.static(path.join(PUBLIC, "models")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SERVER = {
  mission: process.env.DEFAULT_MISSION && process.env.DEFAULT_MISSION in MISSIONS ? process.env.DEFAULT_MISSION : DEFAULT_MISSION,
  scenario: "baseline",
  overrides: {}, // mission -> { `${cid}:${sig}`: value }
  uploaded: {},  // mission -> { [cid]: AstronautData }
  version: 0,
  pvt: [],
  log: [],
  started: Date.now(),
};

const HORIZONS = {
  "24h": ["h", 24],
  "48h": ["h", 48],
  "72h": ["h", 72],
  "7d": ["h", 168],
  "30d": ["d", 30],
  "90d": ["d", 90],
  end: ["d", null],
};

function getState(mission, scenario) {
  const m = mission || SERVER.mission;
  const sc = scenario || SERVER.scenario;
  if (!(m in MISSIONS)) {
    const err = new Error(`unknown mission ${m}`);
    err.status = 404;
    throw err;
  }
  if (!(sc in SCENARIOS)) {
    const err = new Error(`unknown scenario ${sc}`);
    err.status = 404;
    throw err;
  }
  return analysis.get_state(m, sc, SERVER.overrides[m], SERVER.uploaded[m], SERVER.version);
}

function getCrew(st, cid) {
  if (!(cid in st.crew)) {
    const err = new Error(`unknown crew member ${cid}`);
    err.status = 404;
    throw err;
  }
  return st.analyses[cid];
}

const round = (v, dec) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = Math.pow(10, dec);
  return Math.round(v * f) / f;
};
const roundArr = (arr, dec) => Array.from(arr, (v) => round(v, dec));

// ----------------------------------------------------------------------------- pages
app.get("/", (_req, res) => {
  const distIndex = path.join(DIST, "index.html");
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  return res.sendFile(path.join(ROOT, "index.html"));
});
app.get(["/crew", "/astronaut"], (_req, res) => res.sendFile(path.join(STATIC, "astronaut.html")));
app.get("/holo", (_req, res) => res.sendFile(path.join(STATIC, "holo.html")));
// Original LIFELINE mission console (ECG, risk matrix, scorecard, PVT guests), linked from the app.
app.get("/console", (_req, res) => res.sendFile(path.join(STATIC, "index.html")));
// Direct link into mission control (skips the intro). Serve the production build when present.
app.get("/twin", (_req, res) => {
  const distIndex = path.join(DIST, "index.html");
  res.sendFile(fs.existsSync(distIndex) ? distIndex : path.join(ROOT, "index.html"));
});

// ----------------------------------------------------------------------------- proposed protocols
// Immediate action steps for the AI medical officer's answers, ranked by urgency, from the live engine:
// active alerts (each names its onboard protocol), the light-cone decision, and the forecast behind it.
const ANATOMY_TO_ORGAN = {
  brain: ["brain", "head"], nervous: ["eyes", "head"], heart: ["heart"], circulatory: ["heart", "lymph"],
  lungs: ["lungs"], liver: ["gut"], stomach: ["gut"], pancreas: ["gut"], small_intestine: ["gut"],
  large_intestine: ["gut"], kidneys: ["body"], spine: ["spine"], skeletal: ["hips", "spine"], muscular: ["legs"],
};
const RISK_PROTOCOL = { immune: "infection", microbe: "infection", sleep: "fatigue", behavior: "fatigue",
  systems: "fatigue", sans: "sans", bone: "bone", dynamic: "bone", hypoxia: "co2", cancer: "solar" };

function proposeProtocols({ crewId, selectedOrganId, suitActive, suitAlerts, mission }) {
  const st = getState(mission && mission in MISSIONS ? mission : undefined);
  const organs = (selectedOrganId && ANATOMY_TO_ORGAN[selectedOrganId]) || [];
  const riskOrgan = Object.fromEntries(HRP_RISKS.map((r) => [r.id, r.organ]));
  const out = [];
  const seen = new Set();
  const ranked = [...st.alerts].sort((a, b) => {
    const sev = (x) => (x.severity === "act" ? 0 : x.severity === "watch" ? 1 : 2);
    const mine = (x) => (x.crew === crewId ? 0 : 1);
    const here = (x) => (organs.includes(riskOrgan[x.risk]) ? 0 : 1);
    return here(a) - here(b) || sev(a) - sev(b) || mine(a) - mine(b) || (a.act_within_min ?? 1e9) - (b.act_within_min ?? 1e9);
  });
  for (const al of ranked) {
    const key = al.protocol || RISK_PROTOCOL[al.risk];
    const proto = key && content.PROTOCOLS[key];
    if (!proto || seen.has(`${al.crew}:${key}`)) continue;
    seen.add(`${al.crew}:${key}`);
    const crewName = al.crew && st.crew[al.crew] ? st.crew_summary(al.crew).name : "Whole crew";
    const onboard = al.autonomous ?? (al.act_within_min != null && al.earth_reply_min != null && al.act_within_min < al.earth_reply_min);
    out.push({
      id: `${al.id}:${key}`,
      title: proto.title,
      crew: crewName,
      severity: al.severity,
      why: al.detail || al.title,
      act_within_min: al.act_within_min ?? null,
      earth_reply_min: al.earth_reply_min ?? null,
      onboard: Boolean(onboard),
      steps: proto.steps,
      source: "LIFELINE engine alert + onboard protocol library",
    });
    if (out.length >= 3) break;
  }
  // No alert on the structure being discussed: offer the engine's preventive recommendation for its top risk.
  if (crewId && st.crew[crewId] && organs.length && !out.some((p) => p.severity === "act")) {
    const risks = st.risks[crewId];
    const top = HRP_RISKS.filter((r) => organs.includes(r.organ) && risks[r.id])
      .sort((a, b) => risks[b.id].score - risks[a.id].score)[0];
    if (top && risks[top.id].recommendation) {
      out.push({
        id: `${crewId}:${top.id}:preventive`,
        title: `${top.name}: preventive countermeasure`,
        crew: st.crew_summary(crewId).name,
        severity: analysis.band(risks[top.id].score),
        why: `Risk score ${Math.round(risks[top.id].score)}/100 — ${(risks[top.id].drivers || [])[0] || "trend within expected range"}`,
        act_within_min: null,
        earth_reply_min: null,
        onboard: false,
        steps: [risks[top.id].recommendation, "LIFELINE keeps forecasting; escalate only if the 80 % band crosses the threshold."],
        source: `NASA HRP risk: ${top.name}`,
      });
    }
  }
  if (suitActive) {
    for (const a of (suitAlerts || []).filter((x) => x && x.severity === "critical").slice(0, 2)) {
      out.unshift({
        id: `suit:${a.id}`,
        title: `EVA suit: ${a.title}`,
        crew: "EVA crew member",
        severity: "act",
        why: [a.sensorReading, a.reason].filter(Boolean).join(" — "),
        act_within_min: null,
        earth_reply_min: null,
        onboard: true,
        steps: [a.recommendedAction, "Report suit status to IV crew; prepare for EVA termination if the reading persists."].filter(Boolean),
        source: "Simulated suit telemetry",
      });
    }
  }
  return out.slice(0, 4);
}

app.post("/api/assistant", async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await answerMedicalQuery({
      question: body.question,
      selectedOrganId: body.selectedOrganId || null,
      selectedSuitComponentId: body.selectedSuitComponentId || null,
      suitActive: Boolean(body.suitActive),
      explodeProgress: Number(body.explodeProgress || 0),
      mode: body.mode || "holographic",
      isolated: Boolean(body.isolated),
      alerts: Array.isArray(body.alerts) ? body.alerts : [],
      telemetrySummary: typeof body.telemetrySummary === "string" ? body.telemetrySummary : "",
      emergencyContext: typeof body.emergencyContext === "string" ? body.emergencyContext : "",
    });
    let protocols = [];
    try {
      protocols = proposeProtocols({
        crewId: typeof body.crewId === "string" ? body.crewId : null,
        mission: typeof body.mission === "string" ? body.mission : null,
        selectedOrganId: body.selectedOrganId || null,
        suitActive: Boolean(body.suitActive),
        suitAlerts: Array.isArray(body.alerts) ? body.alerts : [],
      });
    } catch (err) {
      console.error("proposeProtocols failed", err);
    }
    res.json({ ...result, protocols });
  } catch (e) {
    next(e);
  }
});

app.get(["/health", "/api/health"], (_req, res) => {
  res.json({
    ok: true,
    uptime_s: Math.round((Date.now() - SERVER.started) / 1000),
    mission: SERVER.mission,
    scenario: SERVER.scenario,
  });
});

// ----------------------------------------------------------------------------- reference
app.get("/api/meta", (_req, res) => {
  res.json({
    missions: Object.values(MISSIONS),
    scenarios: SCENARIOS,
    signals: SIGNALS,
    env_signals: ENV_SIGNALS,
    risks: HRP_RISKS,
    sources: SOURCES,
    indicators: content.INDICATORS,
    protocols: content.PROTOCOLS,
    exams: content.GUIDED_EXAMS,
    regions: content.REGIONS,
    horizons: Object.keys(HORIZONS),
    active: { mission: SERVER.mission, scenario: SERVER.scenario },
    model_glb: fs.existsSync(path.join(STATIC, "models", "astronaut.glb")),
  });
});

app.post("/api/control", (req, res) => {
  const body = req.body || {};
  if (body.mission in MISSIONS) SERVER.mission = body.mission;
  if (body.scenario in SCENARIOS) SERVER.scenario = body.scenario;
  res.json({ mission: SERVER.mission, scenario: SERVER.scenario });
});

// ----------------------------------------------------------------------------- state
app.get("/api/state", async (req, res, next) => {
  try {
    const st = getState(req.query.mission, req.query.scenario);
    const sw = await spaceweather.fetchSpaceWeather();
    const risk_matrix = {};
    for (const cid of Object.keys(st.crew)) {
      risk_matrix[cid] = {};
      for (const [k, v] of Object.entries(st.risks[cid])) {
        risk_matrix[cid][k] = round(v.score, 1);
      }
    }
    res.json({
      mission: st.mission,
      scenario: st.scenario,
      scenario_info: SCENARIOS[st.scenario],
      met: st.met(),
      now: st.now.toISOString(),
      light: st.light,
      ship_vs_body: st.svb,
      crew: Object.keys(st.crew).map((c) => st.crew_summary(c)),
      alerts: st.alerts,
      env: st.env_summary(),
      risk_matrix,
      space_weather: {
        summary: sw.summary,
        live: sw.live,
        cached: Boolean(sw.cached),
        latest_sep: (sw.sep && sw.sep[0]) || null,
        goes: sw.goes ? sw.goes.flux_pfu : null,
      },
      compute_s: st.compute_s,
      pvt_guests: SERVER.pvt.slice(-12),
    });
  } catch (e) {
    next(e);
  }
});

app.get("/api/crew/:cid", (req, res, next) => {
  try {
    const st = getState(req.query.mission, req.query.scenario);
    const an = getCrew(st, req.params.cid);
    const a = an.a;
    const zser = {};
    for (const [k, v] of Object.entries(an.z)) zser[k] = roundArr(v.slice(-72), 2);
    const risks = {};
    for (const [k, v] of Object.entries(st.risks[req.params.cid])) {
      risks[k] = { ...v, band: analysis.band(v.score) };
    }
    const hourly_72 = {};
    for (const s of HOURLY_SIGNALS) hourly_72[s] = roundArr(a.hourly[s].slice(-72), 3);
    const daily_30 = {};
    for (const [s, arr] of Object.entries(a.daily)) daily_30[s] = roundArr(arr.slice(-30), 3);
    const daily_all = {};
    for (const s of ["bmd", "onsd", "muscle", "vo2", "plasma", "mass", "dose"]) {
      daily_all[s] = roundArr(a.daily[s], 3);
    }
    res.json({
      summary: st.crew_summary(req.params.cid),
      risks,
      organs: st.organ_map(req.params.cid),
      task: an.task,
      anomaly: {
        z: zser,
        score: roundArr(an.anom_score.slice(-72), 2),
        detected_hours_ago: an.detect_hours_ago,
        infection_pattern: an.infection_now,
      },
      hourly_72,
      daily_30,
      daily_all,
      asleep_72: roundArr(a.asleep.slice(-72), 2),
      mission_day: st.mission.current_day,
      duration: st.mission.duration_days,
      alerts: st.alerts.filter((x) => x.crew === req.params.cid || x.crew === null),
      attribution: st.svb.per_crew[req.params.cid],
    });
  } catch (e) {
    next(e);
  }
});

app.get("/api/forecast/:cid/:signal", (req, res, next) => {
  try {
    const horizon = req.query.horizon || "24h";
    const st = getState(req.query.mission, req.query.scenario);
    const an = getCrew(st, req.params.cid);
    const sig = req.params.signal;
    if (!(sig in SIGNALS)) return res.status(404).send("unknown signal");
    if (!(horizon in HORIZONS)) return res.status(400).send("unknown horizon");
    let [kind, h] = HORIZONS[horizon];
    if (h === null) h = an.days_left;
    let out;
    if (kind === "h" && HOURLY_SIGNALS.includes(sig)) {
      out = an.hourly_forecast(sig, h);
    } else {
      if (!FORECAST_DAILY.includes(sig) && !HOURLY_SIGNALS.includes(sig)) {
        return res.status(400).send("signal has no forecast");
      }
      const days = kind === "d" ? h : Math.max(2, Math.floor(h / 24));
      out = an.daily_forecast(sig, days);
    }
    out.meta = SIGNALS[sig];
    out.horizon_key = horizon;
    res.json(out);
  } catch (e) {
    next(e);
  }
});

app.get("/api/whatif/:cid", (req, res, next) => {
  try {
    const st = getState(req.query.mission, req.query.scenario);
    res.json(whatif.simulate(getCrew(st, req.params.cid), {}));
  } catch (e) {
    next(e);
  }
});

app.post("/api/whatif/:cid", (req, res, next) => {
  try {
    const st = getState(req.query.mission, req.query.scenario);
    res.json(whatif.simulate(getCrew(st, req.params.cid), req.body || {}));
  } catch (e) {
    next(e);
  }
});

app.get("/api/spaceweather", async (req, res, next) => {
  try {
    const force = req.query.force === "true" || req.query.force === "1";
    res.json(await spaceweather.fetchSpaceWeather(force));
  } catch (e) {
    next(e);
  }
});

app.get("/api/earthlink", (req, res, next) => {
  try {
    const st = getState(req.query.mission);
    const em = orbits.earth_mars();
    res.json({
      light: st.light,
      geometry: em,
      mission: st.mission.id,
      transit_fraction: st.mission.current_day / st.mission.duration_days,
      ground_response_min: analysis.GROUND_RESPONSE_MIN,
    });
  } catch (e) {
    next(e);
  }
});

app.get("/api/lightdelay", (_req, res) => {
  const st = getState();
  res.json({ one_way_s: st.light.owlt_s });
});

app.post("/api/ask", async (req, res, next) => {
  try {
    const body = req.body || {};
    const q = String(body.q || "").trim();
    if (!q) return res.status(400).send("empty question");
    const st = getState(body.mission, body.scenario);
    res.json(await copilot.answer(q.slice(0, 500), st, body.crew || null));
  } catch (e) {
    next(e);
  }
});

app.get("/api/briefing", (req, res, next) => {
  try {
    res.json(copilot.briefing(getState(req.query.mission, req.query.scenario)));
  } catch (e) {
    next(e);
  }
});

app.post("/api/log", (req, res) => {
  const body = req.body || {};
  const cid = body.crew;
  const sig = body.signal;
  const val = Number(body.value);
  if (body.value === "" || body.value === null || body.value === undefined || !Number.isFinite(val)) {
    return res.status(400).send("value must be a number");
  }
  if (!(sig in SIGNALS) || SIGNALS[sig].kind !== "daily") {
    return res.status(400).send("only daily measures can be logged here");
  }
  const m = body.mission || SERVER.mission;
  (SERVER.overrides[m] ||= {})[`${cid}:${sig}`] = val;
  SERVER.version += 1;
  SERVER.log.push({ t: new Date().toISOString(), crew: cid, signal: sig, value: val });
  res.json({ ok: true, version: SERVER.version });
});

app.post("/api/pvt", (req, res) => {
  const body = req.body || {};
  const trials = (body.trials || []).map(Number).filter((x) => Number.isFinite(x) && x >= 100 && x <= 2000);
  if (!trials.length) return res.status(400).send("no valid trials");
  const med = fc.median(trials);
  const entry = {
    t: new Date().toISOString(),
    name: String(body.name || "Guest").slice(0, 24),
    crew: body.crew || null,
    median_ms: Math.round(med),
    trials: trials.map((x) => Math.round(x)),
  };
  SERVER.pvt.push(entry);
  if (body.crew) {
    const m = body.mission || SERVER.mission;
    (SERVER.overrides[m] ||= {})[`${body.crew}:pvt`] = med;
    SERVER.version += 1;
  }
  res.json(entry);
});

app.get("/api/pvt", (_req, res) => {
  res.json({ results: SERVER.pvt.slice(-50) });
});

app.post("/api/ingest", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("no file uploaded");
  const raw = req.file.buffer.toString("utf-8");
  const m = req.query.mission || SERVER.mission;
  try {
    const [data, report] = ingest.parse_csv(raw, m);
    SERVER.uploaded[m] = { ...(SERVER.uploaded[m] || {}), ...data };
    SERVER.version += 1;
    res.json({ ok: true, report });
  } catch (e) {
    res.status(400).send(e.message || String(e));
  }
});

app.delete("/api/ingest", (_req, res) => {
  SERVER.uploaded = {};
  SERVER.overrides = {};
  SERVER.version += 1;
  res.json({ ok: true });
});

app.get("/api/template.csv", (req, res, next) => {
  try {
    const st = getState(req.query.mission);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=sentinel_template.csv");
    res.send(ingest.template_csv(st));
  } catch (e) {
    next(e);
  }
});

app.get("/api/validation", (req, res, next) => {
  try {
    const st = getState(req.query.mission, req.query.scenario);
    const rows = [];
    for (const [cid, an] of Object.entries(st.analyses)) {
      for (const s of HOURLY_SIGNALS) {
        const cal = an.hcal[s];
        for (const h of fc.horizon_summary(cal, [1, 6, 24, 48, 72, 168])) {
          rows.push({
            crew: cid,
            signal: s,
            kind: "hourly",
            h: h.h,
            unit: "h",
            mae: h.mae,
            mae_naive: h.mae_naive,
            skill: h.skill,
            coverage80: cal.coverage80,
            coverage95: cal.coverage95,
            n: cal.n_origins,
          });
        }
      }
      for (const s of FORECAST_DAILY) {
        for (const [H, v] of Object.entries(an.dbt[s] || {})) {
          if (v) {
            rows.push({
              crew: cid,
              signal: s,
              kind: "daily",
              h: Number(H),
              unit: "d",
              mae: v.mae,
              mae_naive: v.mae_naive,
              skill: v.skill,
              coverage80: v.coverage80,
              coverage95: v.coverage95,
              n: v.n,
            });
          }
        }
      }
    }
    const agg = new Map();
    for (const r of rows) {
      const k = `${r.kind}:${r.h}`;
      if (!agg.has(k)) agg.set(k, []);
      agg.get(k).push(r);
    }
    const summary = [...agg.entries()]
      .sort(([a], [b]) => {
        const [ka, ha] = a.split(":");
        const [kb, hb] = b.split(":");
        if (ka !== kb) return ka === "hourly" ? -1 : 1;
        return Number(ha) - Number(hb);
      })
      .map(([k, rs]) => {
        const [kind, h] = k.split(":");
        const sk = rs.map((r) => r.skill).filter((x) => x !== null && x !== undefined);
        const c80 = rs.map((r) => r.coverage80).filter((x) => x !== null && x !== undefined);
        const c95 = rs.map((r) => r.coverage95).filter((x) => x !== null && x !== undefined);
        return {
          kind,
          h: Number(h),
          unit: kind === "hourly" ? "h" : "d",
          skill_median: sk.length ? fc.median(sk) : null,
          coverage80: c80.length ? fc.mean(c80) : null,
          coverage95: c95.length ? fc.mean(c95) : null,
          n_series: rs.length,
        };
      });
    res.json({ rows, summary });
  } catch (e) {
    next(e);
  }
});

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).send(err.message || "Internal error");
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DEADSTAR LIFELINE listening on http://0.0.0.0:${PORT}`);
  setImmediate(() => {
    try {
      getState();
      spaceweather.fetchSpaceWeather().catch(() => {});
    } catch (e) {
      console.warn("warmup failed", e);
    }
  });
});
