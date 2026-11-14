import * as circadian from "./circadian.js";
import * as fc from "./forecast.js";
import * as orbits from "./orbits.js";
import {
  MISSIONS,
  SIGNALS,
  ENV_SIGNALS,
  HOURLY_SIGNALS,
  FORECAST_DAILY,
  HRP_RISKS,
  CAREER_DOSE_LIMIT_MSV,
  CO2_LIMIT_1H_MMHG,
  CO2_HEADACHE_7D_MMHG,
  BMD_LOSS_PER_MONTH_HIP,
} from "./constants.js";
import { CREW, generate_crew, generate_env, mission_clock } from "./crew.js";

export const MAX_H = 168;
export const GROUND_RESPONSE_MIN = 30.0;

const round = (v, dec) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = Math.pow(10, dec);
  return Math.round(v * f) / f;
};
const roundArr = (arr, dec) => Array.from(arr, (v) => round(v, dec));

export function daily_prior(sig, mission) {
  const g = mission.gravity_g;
  const gp = 1 - 0.6 * g;
  if (sig === "bmd") {
    const r = (BMD_LOSS_PER_MONTH_HIP * 100 * 0.62 * gp) / 30.0;
    return [-r, r * 0.45, 90];
  }
  if (sig === "muscle") return [-0.012 * gp, 0.015, 90];
  if (sig === "vo2") return [0.0, 0.02, 60];
  if (sig === "onsd") return [0.0008 * (1 - 0.5 * g), 0.0012, 90];
  if (sig === "plasma") return [0.0, 0.01, 45];
  if (sig === "mass") return [-0.008, 0.01, 60];
  if (sig === "dose") return [mission.dose_msv_day, mission.dose_msv_day * 0.08, 30];
  if (sig === "glucose") return [0.0, 0.03, 45];
  return [0.0, 0.01, 21];
}

function processQ(sig, y) {
  let s = 1.0;
  if (y.length > 10) {
    const tail = y.slice(-60);
    const d = [];
    for (let i = 1; i < tail.length; i++) d.push(tail[i] - tail[i - 1]);
    if (d.length > 2) s = fc.std(d);
  }
  if (["bmd", "onsd", "muscle", "vo2", "mass", "dose"].includes(sig)) {
    return Math.pow(0.08 * s, 2);
  }
  return Math.pow(0.25 * s, 2);
}

function dailyMeans(hourlyArr, hours) {
  const D = Math.floor(hours / 24);
  const out = new Float64Array(D);
  for (let d = 0; d < D; d++) {
    let s = 0;
    const base = d * 24;
    for (let h = 0; h < 24; h++) s += hourlyArr[base + h];
    out[d] = s / 24;
  }
  return out;
}

export class AstronautAnalysis {
  constructor(a, mission, env, owlt_s) {
    this.a = a;
    this.m = mission;
    this.env = env;
    this.owlt_s = owlt_s;
    this.days_left = Math.max(1, mission.duration_days - mission.current_day);
    this._hourly();
    this._daily();
    this._anomaly();
    this._readiness();
  }

  _hourly() {
    this.hmodels = {};
    this.hcal = {};
    this.hfc = {};
    for (const s of HOURLY_SIGNALS) {
      const y = this.a.hourly[s];
      const m = new fc.HourlyModel(y);
      const path = m.predict(MAX_H);
      const bt = y.length >= fc.FIT_DAYS * 24 + MAX_H + 40 ? fc.backtest_hourly(y, MAX_H) : null;
      let cal;
      if (bt !== null) {
        cal = fc.conformal_from_backtest(bt, MAX_H);
        cal.calibrated = true;
      } else {
        const q80 = new Float64Array(MAX_H);
        const q95 = new Float64Array(MAX_H);
        const mae = new Float64Array(MAX_H);
        const mae_naive = new Float64Array(MAX_H);
        for (let i = 0; i < MAX_H; i++) {
          const sd = m.sigma * Math.sqrt(1 + (i + 1) / 24);
          q80[i] = fc.Z80 * sd;
          q95[i] = fc.Z95 * sd;
          mae[i] = 0.8 * sd;
          mae_naive[i] = sd;
        }
        cal = {
          q80,
          q95,
          mae,
          mae_naive,
          coverage80: null,
          coverage95: null,
          n_origins: 0,
          n_eval: 0,
          calibrated: false,
        };
      }
      this.hmodels[s] = m;
      this.hcal[s] = cal;
      this.hfc[s] = path;
    }
  }

  _daily() {
    this.dfits = {};
    this.dbt = {};
    for (const s of FORECAST_DAILY) {
      const y = this.a.daily[s];
      const [ps, psd, win] = daily_prior(s, this.m);
      const q = processQ(s, y);
      this.dfits[s] = fc.bayes_trend(y, ps, psd, win, null, q);
      this.dbt[s] = fc.backtest_daily(y, ps, psd, win, [3, 7, 14, 30], 30, 3, q);
    }
    for (const s of HOURLY_SIGNALS) {
      const y = dailyMeans(this.a.hourly[s], this.a.hours);
      const q = processQ(s, y);
      this.dfits["dm_" + s] = fc.bayes_trend(y, 0.0, 0.01, 21, null, q);
      this.dbt["dm_" + s] = fc.backtest_daily(y, 0.0, 0.01, 21, [3, 7, 14, 30], 30, 3, q);
    }
  }

  _anomaly() {
    const H = this.a.hours;
    const baseEnd = H - 48;
    const baseStart = Math.max(0, baseEnd - 14 * 24);
    const look = Math.min(168, H - baseStart - 24);
    const sigs = ["hr", "hrv", "temp", "rr", "spo2"];
    const sl = this.a.asleep;

    const slBuckets = Array.from({ length: 24 }, () => []);
    for (let t = baseStart; t < baseEnd; t++) {
      slBuckets[t % 24].push(sl[t]);
    }
    const slProf = slBuckets.map((b) => (b.length ? fc.mean(b) : 0));

    const idx = [];
    for (let t = H - look; t < H; t++) idx.push(t);

    const Z = {};
    for (const s of sigs) {
      const y = this.a.hourly[s];
      const sigBuckets = Array.from({ length: 24 }, () => []);
      for (let t = baseStart; t < baseEnd; t++) {
        sigBuckets[t % 24].push(y[t]);
      }
      const prof = sigBuckets.map((b) => (b.length ? fc.median(b) : 0));

      let dotDsR0 = 0;
      let dotDsDs = 0;
      const r0Arr = new Float64Array(baseEnd - baseStart);
      const dsArr = new Float64Array(baseEnd - baseStart);
      for (let k = 0; k < baseEnd - baseStart; k++) {
        const t = baseStart + k;
        const h = t % 24;
        const ds = sl[t] - slProf[h];
        const r0 = y[t] - prof[h];
        dsArr[k] = ds;
        r0Arr[k] = r0;
        dotDsR0 += ds * r0;
        dotDsDs += ds * ds;
      }
      const beta = dotDsR0 / (dotDsDs || 1e-9);
      const res = new Float64Array(baseEnd - baseStart);
      for (let k = 0; k < res.length; k++) res[k] = r0Arr[k] - beta * dsArr[k];
      const medRes = fc.median(res);
      const absDev = res.map((v) => Math.abs(v - medRes));
      const scale = 1.4826 * fc.median(absDev) || 1e-6;

      const r = new Float64Array(idx.length);
      for (let k = 0; k < idx.length; k++) {
        const t = idx[k];
        const h = t % 24;
        r[k] = (y[t] - prof[h] - beta * (sl[t] - slProf[h])) / scale;
      }
      const zConv = new Float64Array(idx.length);
      for (let k = 0; k < idx.length; k++) {
        let sum = 0;
        for (let m = 0; m < 6 && k - m >= 0; m++) sum += r[k - m];
        zConv[k] = sum / 6;
      }
      Z[s] = zConv;
    }

    this.z = Z;
    this.z_index = idx;
    const L = idx.length;
    this.anom_score = new Float64Array(L);
    const run = new Int32Array(L);
    for (let j = 0; j < L; j++) {
      let sq = 0;
      for (const s of sigs) {
        const clipped = Math.min(8, Math.abs(Z[s][j]));
        sq += clipped * clipped;
      }
      this.anom_score[j] = Math.sqrt(sq / sigs.length);
      const inf = Z.temp[j] > 1.8 && Z.hr[j] > 1.2 && Z.hrv[j] < -1.0;
      run[j] = inf ? (j > 0 ? run[j - 1] + 1 : 1) : 0;
    }

    this.infection_now = run[L - 1] >= 3;
    let detect = null;
    if (this.infection_now) {
      for (let j = Math.max(0, L - 72); j < L; j++) {
        if (run[j] >= 3) {
          detect = j - 2;
          break;
        }
      }
    }
    this.detect_hours_ago = detect !== null ? L - 1 - detect : null;
    this.current_z = {};
    for (const s of sigs) this.current_z[s] = Z[s][L - 1];

    const tt = this.a.hourly.temp.slice(H - 72);
    let firstBreach = null;
    for (let j = 0; j < tt.length; j++) {
      if (tt[j] >= 38.0) {
        firstBreach = 72 - 1 - j;
        break;
      }
    }
    this.first_breach_hours_ago = firstBreach;
  }

  _readiness() {
    const nowClock = this.a.now_index % 24;
    const taskClock = 9.0;
    let ahead = ((taskClock - nowClock) % 24 + 24) % 24;
    if (ahead < 4) ahead += 24;
    this.task = circadian.readiness(this.a, ahead);
  }

  hourly_forecast(s, horizon) {
    horizon = Math.min(horizon, MAX_H);
    const y = this.a.hourly[s];
    const cal = this.hcal[s];
    const path = this.hfc[s].slice(0, horizon);
    const q80 = cal.q80.slice(0, horizon);
    const q95 = cal.q95.slice(0, horizon);
    const histLen = Math.min(y.length, Math.max(48, horizon));
    const hist = y.slice(y.length - histLen);

    const lo80 = path.map((v, i) => v - q80[i]);
    const hi80 = path.map((v, i) => v + q80[i]);
    const lo95 = path.map((v, i) => v - q95[i]);
    const hi95 = path.map((v, i) => v + q95[i]);

    const out = {
      signal: s,
      resolution: "hour",
      horizon,
      history: roundArr(hist, 3),
      history_start: -hist.length + 1,
      mean: roundArr(path, 3),
      lo80: roundArr(lo80, 3),
      hi80: roundArr(hi80, 3),
      lo95: roundArr(lo95, 3),
      hi95: roundArr(hi95, 3),
      calibrated: cal.calibrated,
      backtest: {
        n_origins: cal.n_origins,
        n_eval: cal.n_eval,
        coverage80: cal.coverage80,
        coverage95: cal.coverage95,
        horizons: fc.horizon_summary(
          cal,
          [1, 6, 24, 48, 72, 168].filter((h) => h <= MAX_H)
        ),
      },
    };

    const thr = SIGNALS[s]?.threshold;
    if (thr) {
      const probs = [];
      let bestK = 0;
      let bestP = -1;
      let cross = null;
      for (let i = 0; i < path.length; i++) {
        const p = fc.exceed_prob(path[i], q80[i], thr.value, thr.dir);
        probs.push(p);
        if (p > bestP) {
          bestP = p;
          bestK = i;
        }
        if (cross === null) {
          const hit = thr.dir === "above" ? path[i] >= thr.value : path[i] <= thr.value;
          if (hit) cross = i + 1;
        }
      }
      out.threshold = {
        ...thr,
        peak_prob: bestP,
        peak_in_h: bestK + 1,
        probs: roundArr(probs, 4),
        mean_crosses_in_h: cross,
      };
    }
    return out;
  }

  daily_forecast(s, horizonDays) {
    const key = s in this.dfits ? s : "dm_" + s;
    const fit = this.dfits[key];
    const y = s in this.a.daily ? this.a.daily[s] : dailyMeans(this.a.hourly[s], this.a.hours);
    const { mu, sd } = fc.bayes_predict(fit, horizonDays);
    const histLen = Math.min(y.length, Math.max(30, horizonDays));
    const hist = y.slice(y.length - histLen);
    const bt = this.dbt[key] || {};

    const lo80 = mu.map((v, i) => v - fc.Z80 * sd[i]);
    const hi80 = mu.map((v, i) => v + fc.Z80 * sd[i]);
    const lo95 = mu.map((v, i) => v - fc.Z95 * sd[i]);
    const hi95 = mu.map((v, i) => v + fc.Z95 * sd[i]);

    const btEntries = Object.entries(bt).filter(([, v]) => v);
    const backtested = btEntries.length > 0;
    const longest = backtested ? Math.max(...btEntries.map(([k]) => Number(k))) : 0;

    const out = {
      signal: s,
      resolution: "day",
      horizon: horizonDays,
      history: roundArr(hist, 4),
      history_start: -hist.length + 1,
      mean: roundArr(mu, 4),
      lo80: roundArr(lo80, 4),
      hi80: roundArr(hi80, 4),
      lo95: roundArr(lo95, 4),
      hi95: roundArr(hi95, 4),
      slope_per_day: fit.mean[1],
      slope_sd: Math.sqrt(fit.cov[1][1]),
      prior_slope: fit.prior_slope,
      prior_sd: fit.prior_sd,
      n: fit.n,
      backtest: bt,
      mission_days_left: this.days_left,
      evidence:
        backtested && horizonDays <= longest
          ? "backtested"
          : backtested
            ? "partly backtested"
            : "prior-dominated",
    };

    const thr = SIGNALS[s]?.threshold;
    if (thr) {
      const probs = [];
      for (let i = 0; i < mu.length; i++) {
        const z = (thr.value - mu[i]) / Math.max(sd[i], 1e-6);
        const pAbove = 1 - fc.norm_cdf(z);
        probs.push(thr.dir === "above" ? pAbove : 1 - pAbove);
      }
      out.threshold = {
        ...thr,
        prob_at_horizon: probs[probs.length - 1],
        probs: roundArr(probs, 4),
      };
    }
    return out;
  }

  end_of_mission(s) {
    const fit = this.dfits[s];
    const { mu, sd } = fc.bayes_predict(fit, this.days_left);
    return [mu[mu.length - 1], sd[sd.length - 1]];
  }
}

export function ship_vs_body(analyses, env, mission) {
  const co2 = env.co2;
  const co2_1h = co2[co2.length - 1];
  const co2_7d = fc.mean(co2.slice(-168));
  const baseRad = (mission.dose_msv_day * 1000) / 24.0;
  const radNow = env.rad_rate[env.rad_rate.length - 1];
  const radRatio = radNow / baseRad;

  const evidence = [];
  const per = {};
  const ventil = {};
  let nVent = 0;
  for (const [cid, an] of Object.entries(analyses)) {
    const v = an.current_z.rr > 1.6 && an.current_z.hr > 0.8;
    ventil[cid] = v;
    if (v) nVent++;
  }

  const shipCo2 = co2_1h > CO2_LIMIT_1H_MMHG;
  const shipRad = radRatio > 5;

  for (const [cid, an] of Object.entries(analyses)) {
    let attrib = "none";
    let reason = "";
    if (shipCo2 && ventil[cid]) {
      attrib = "ship";
      reason = `Breathing and heart rate up together with cabin CO₂ at ${co2_1h.toFixed(1)} mmHg`;
    }
    if (an.infection_now || an.detect_hours_ago !== null) {
      if (attrib === "ship") {
        attrib = "both";
        reason += "; plus an infection-like pattern the cabin cannot explain";
      } else {
        attrib = "body";
        reason = "Temperature, heart rate and HRV moving together with normal cabin air";
      }
    }
    per[cid] = { attribution: attrib, reason };
  }

  if (shipCo2) {
    evidence.push(`Cabin ppCO₂ ${co2_1h.toFixed(2)} mmHg (1-h limit ${CO2_LIMIT_1H_MMHG.toFixed(0)} mmHg, NASA-STD-3001)`);
    evidence.push(`${nVent} of ${Object.keys(analyses).length} crew show raised breathing and heart rate at the same time`);
  }
  if (co2_7d > CO2_HEADACHE_7D_MMHG) {
    evidence.push(`7-day mean ppCO₂ ${co2_7d.toFixed(2)} mmHg above the 2.5 mmHg headache-risk line`);
  }
  if (shipRad) {
    evidence.push(`Dose rate ${Math.round(radNow).toLocaleString("en-US")} µSv/h, ${radRatio.toFixed(0)}× the mission background`);
  }

  const bodies = Object.entries(per)
    .filter(([, p]) => p.attribution === "body" || p.attribution === "both")
    .map(([cid]) => cid);

  let verdict;
  if ((shipCo2 || shipRad) && bodies.length) verdict = "BOTH";
  else if (shipCo2 || shipRad) verdict = "SHIP";
  else if (bodies.length) verdict = "BODY";
  else verdict = "NOMINAL";

  const names = Object.fromEntries(CREW.map((c) => [c.id, c.name.split(" ").slice(-1)[0]]));
  let headline;
  if (verdict === "SHIP" && shipCo2) {
    headline = `It's the ship, not the crew: cabin CO₂ is ${co2_1h.toFixed(1)} mmHg.`;
  } else if (verdict === "SHIP") {
    headline = "It's the ship's environment: radiation storm in progress.";
  } else if (verdict === "BOTH") {
    const b = bodies.map((c) => names[c]).join(", ");
    const cause = shipCo2 ? `cabin CO₂ ${co2_1h.toFixed(1)} mmHg` : "a radiation storm";
    headline = `Two separate problems: ${cause} for the whole crew, and ${b}'s own physiology.`;
  } else if (verdict === "BODY") {
    const b = bodies.map((c) => names[c]).join(", ");
    headline = `It's ${b}'s body, not the ship: cabin air and radiation are nominal.`;
  } else {
    headline = "Ship and crew nominal.";
  }

  return {
    verdict,
    headline,
    evidence,
    per_crew: per,
    co2_1h,
    co2_7d,
    rad_now: radNow,
    rad_ratio: radRatio,
  };
}

const fmtSigned = (v, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

export function risk_scores(an, crewMoodSd, svb) {
  const a = an.a;
  const m = an.m;
  const d = a.daily;
  const day = m.current_day;
  const out = {};
  const put = (rid, score, drivers, recommendation) => {
    out[rid] = {
      score: Math.max(0, Math.min(100, score)),
      drivers,
      recommendation,
    };
  };

  const z = an.current_z;
  let inf = 0.0;
  if (an.infection_now) inf = 72 + 6 * Math.min(4, z.temp - 2);
  else if (an.detect_hours_ago !== null) inf = 60;
  const debt = an.task.sleep_debt_3n;

  put(
    "immune",
    Math.max(inf, 12 + 4 * debt),
    [
      `Temp z ${fmtSigned(z.temp)}, HR z ${fmtSigned(z.hr)}, HRV z ${fmtSigned(z.hrv)}`,
      ...(an.detect_hours_ago !== null ? [`Infection-like pattern detected ${an.detect_hours_ago} h ago`] : []),
    ],
    "Repeat temperature, saliva swab for viral reactivation, protect sleep"
  );

  put(
    "sensorimotor",
    8 + 60 * Math.exp(-day / 5) + (an.days_left < 10 ? 35 : 0),
    [`Mission day ${day}; ${an.days_left} days to next gravity transition`],
    "Vestibular checks before and after gravity transitions"
  );

  const plasma = d.plasma[d.plasma.length - 1];
  put(
    "cardio",
    8 + 1.1 * Math.max(0, 100 - plasma) + 3 * Math.max(0, z.hr),
    [`Plasma volume ${plasma.toFixed(0)} % of baseline`, `HR z ${fmtSigned(z.hr)}`],
    "Fluid loading and orthostatic countermeasures before landing"
  );

  const eva = m.eva;
  put("dcs", eva ? 18 : 4, [eva ? "EVA schedule active" : "No EVA in this mission phase"], "Prebreathe protocol before EVA");
  put("microbe", 10 + 0.3 * inf, ["Closed habitat, shared air and water"], "Surface sampling, hand hygiene");

  const spo2 = fc.mean(a.hourly.spo2.slice(-6));
  put("hypoxia", 6 + Math.max(0, 96.5 - spo2) * 22, [`SpO₂ ${spo2.toFixed(1)} % (6-h mean)`], "Check cabin ppO₂ and suit O₂");

  const massLoss = ((d.mass[0] - d.mass[d.mass.length - 1]) / d.mass[0]) * 100;
  const glu = d.glucose[d.glucose.length - 1];
  put(
    "nutrition",
    8 + 6 * Math.max(0, massLoss) + Math.max(0, glu - 100) * 1.2,
    [`Body mass ${fmtSigned(massLoss)} % since launch`, `Fasting glucose ${glu.toFixed(0)} mg/dL`],
    "Energy intake review; vitamin D and calcium"
  );

  const musc = d.muscle[d.muscle.length - 1];
  put(
    "eva",
    (eva ? 22 : 5) + Math.max(0, 100 - an.task.task_relative) * 0.4 + Math.max(0, 100 - musc) * 0.8,
    [`Task readiness ${an.task.task_relative.toFixed(0)} %`, `Leg strength ${musc.toFixed(0)} %`],
    "Fatigue check before suited operations"
  );

  const vo2 = d.vo2[d.vo2.length - 1];
  put(
    "fitness",
    6 + 2.6 * Math.max(0, 100 - vo2) + 2.0 * Math.max(0, 100 - musc),
    [`VO₂max ${vo2.toFixed(0)} % of baseline`, `Leg strength ${musc.toFixed(0)} %`],
    "Maintain aerobic and resistive exercise prescriptions"
  );

  const [oMu, oSd] = an.end_of_mission("onsd");
  const pSans = 1 - fc.norm_cdf((6.0 - oMu) / Math.max(oSd, 1e-6));
  put(
    "sans",
    5 + 90 * pSans,
    [
      `ONSD ${d.onsd[d.onsd.length - 1].toFixed(2)} mm now, ${oMu.toFixed(2)} ± ${oSd.toFixed(2)} mm at mission end`,
      `P(ONSD ≥ 6.0 mm by mission end) ${Math.round(pSans * 100)}%`,
    ],
    "Optic ultrasound and OCT; B-Complex and thigh-cuff protocols (investigational)"
  );

  const [bMu, bSd] = an.end_of_mission("bmd");
  const pBone = fc.norm_cdf((90.0 - bMu) / Math.max(bSd, 1e-6));
  const lossEnd = 100 - bMu;
  put(
    "bone",
    4 + 4.0 * Math.max(0, lossEnd) + 40 * pBone,
    [
      `Hip BMD ${d.bmd[d.bmd.length - 1].toFixed(1)} % now, ${bMu.toFixed(1)} ± ${bSd.toFixed(1)} % at mission end`,
      `P(≥10 % loss by mission end) ${Math.round(pBone * 100)}%`,
    ],
    "Resistive exercise loading; bisphosphonate if the flight surgeon agrees"
  );

  const mood = fc.mean(d.mood.slice(-3));
  put(
    "behavior",
    6 + Math.max(0, 78 - mood) * 1.8 + Math.min(20, day / 15),
    [`Mood index ${mood.toFixed(0)} (3-day mean)`, `Mission day ${day} in isolation`],
    "Private conferences, schedule autonomy, Earth-view time"
  );

  const owltMin = an.owlt_s / 60;
  put(
    "teamwork",
    8 + crewMoodSd * 1.5 + Math.min(20, owltMin * 1.2),
    [`Crew mood spread ±${crewMoodSd.toFixed(0)}`, `${owltMin.toFixed(1)} min one-way delay to ground`],
    "Structured debriefs; autonomy-supporting procedures"
  );

  const pvt = d.pvt[d.pvt.length - 1];
  put(
    "sleep",
    6 + debt * 9 + Math.max(0, pvt - 280) * 0.35,
    [`Sleep debt ${debt.toFixed(1)} h over 3 nights`, `Reaction time ${pvt.toFixed(0)} ms`],
    "Protect the next sleep period; light and caffeine strategy"
  );

  put(
    "systems",
    8 + Math.min(30, owltMin * 2.2),
    [`Ground support delayed ${(2 * owltMin).toFixed(0)} min round trip`],
    "Onboard procedures and decision support (this system)"
  );

  put(
    "dynamic",
    5 + (an.days_left < 14 ? 45 : 0) + Math.max(0, 100 - musc) * 0.5,
    [`${an.days_left} days to landing`, `Leg strength ${musc.toFixed(0)} %`],
    "Seat fit and landing-load countermeasures"
  );

  const doseNow = d.dose[d.dose.length - 1];
  const [dmu] = an.end_of_mission("dose");
  put(
    "cancer",
    60 * Math.pow(dmu / CAREER_DOSE_LIMIT_MSV, 1.5),
    [
      `Dose ${doseNow.toFixed(0)} mSv now, ${dmu.toFixed(0)} mSv projected at mission end`,
      `${Math.round((dmu / CAREER_DOSE_LIMIT_MSV) * 100)}% of the 600 mSv career limit`,
    ],
    "Storm shelter discipline during solar particle events"
  );

  const attr = svb.per_crew[a.meta.id]?.attribution;
  if (attr === "ship" || attr === "both") {
    out.hypoxia.score = Math.max(out.hypoxia.score, 55);
    out.hypoxia.drivers.unshift(`Cabin ppCO₂ ${svb.co2_1h.toFixed(1)} mmHg`);
  }
  return out;
}

export function band(score) {
  return score >= 60 ? "act" : score >= 30 ? "watch" : "nominal";
}

export class CrewState {
  constructor(missionId, scenario = "baseline", overrides = null, uploaded = null) {
    const tStart = Date.now();
    this.mission = MISSIONS[missionId];
    this.scenario = scenario;
    const clk = mission_clock(missionId);
    this.t0 = clk.t0;
    this.hours = clk.hours;
    this.now = clk.now;
    this.crew = generate_crew(missionId, null, scenario);
    if (uploaded) {
      for (const [cid, data] of Object.entries(uploaded)) {
        this.crew[cid] = data;
      }
    }
    if (overrides) {
      for (const [key, val] of Object.entries(overrides)) {
        const [cid, sig] = key.split(":");
        if (this.crew[cid] && sig in this.crew[cid].daily) {
          this.crew[cid].daily[sig] = new Float64Array(this.crew[cid].daily[sig]);
          this.crew[cid].daily[sig][this.crew[cid].daily[sig].length - 1] = val;
        }
      }
    }
    this.env = generate_env(missionId, null, scenario);
    this.light = orbits.light_time(this.mission);
    this.analyses = {};
    for (const [cid, a] of Object.entries(this.crew)) {
      this.analyses[cid] = new AstronautAnalysis(a, this.mission, this.env, this.light.owlt_s);
    }
    const moods = Object.values(this.crew).map((a) => fc.mean(a.daily.mood.slice(-3)));
    this.crew_mood_sd = fc.std(moods);
    this.svb = ship_vs_body(this.analyses, this.env, this.mission);
    this.risks = {};
    for (const [cid, an] of Object.entries(this.analyses)) {
      this.risks[cid] = risk_scores(an, this.crew_mood_sd, this.svb);
    }
    this.alerts = this._alerts();
    this.compute_s = round((Date.now() - tStart) / 1000, 2);
  }

  _autonomy(actWithinMin) {
    const rt = (2 * this.light.owlt_s) / 60;
    const earthReply = rt + GROUND_RESPONSE_MIN;
    const auto = earthReply > actWithinMin || Boolean(this.light.blackout);
    return {
      act_within_min: actWithinMin,
      earth_round_trip_min: round(rt, 1),
      earth_reply_min: round(earthReply, 1),
      autonomous: auto,
    };
  }

  _alerts() {
    const alerts = [];
    const names = Object.fromEntries(CREW.map((c) => [c.id, c]));
    for (const [cid, an] of Object.entries(this.analyses)) {
      const meta = names[cid] || an.a.meta;
      const last = meta.name.split(" ").slice(-1)[0];
      if (an.detect_hours_ago !== null || an.infection_now) {
        const tf = an.hourly_forecast("temp", 24);
        const p = tf.threshold.peak_prob;
        const cross = tf.threshold.mean_crosses_in_h;
        const lead = an.detect_hours_ago;
        const leadTotal = lead !== null && cross ? lead + cross : null;
        alerts.push({
          id: `${cid}-immune`,
          crew: cid,
          severity: "act",
          risk: "immune",
          title: `${last}: infection-like pattern`,
          detail:
            `Core temperature, heart rate and HRV have drifted together for ${lead} h. ` +
            `P(fever ≥ 38.0 °C within 24 h) = ${Math.round(p * 100)}%` +
            (cross ? `; mean forecast crosses 38.0 °C in ${cross} h.` : "."),
          detected_hours_ago: lead,
          lead_hours: leadTotal,
          fever_in_h: cross,
          fever_prob_24h: p,
          first_breach_hours_ago: an.first_breach_hours_ago,
          protocol: "infection",
          ...this._autonomy(45),
        });
      }
      const tr = an.task;
      if (tr.task_relative < 78) {
        const sev = tr.task_relative < 70 ? "act" : "watch";
        const taskName = this.mission.eva ? "EVA" : "manual trajectory-correction oversight";
        alerts.push({
          id: `${cid}-sleep`,
          crew: cid,
          severity: sev,
          risk: "sleep",
          title: `${last}: reduced readiness for ${taskName} at 09:00`,
          detail:
            `Predicted alertness at task time ${tr.task_relative.toFixed(0)} % of a well-rested ` +
            `baseline (two-process model). Sleep debt ${tr.sleep_debt_3n.toFixed(1)} h over 3 nights.`,
          protocol: "fatigue",
          ...this._autonomy(240),
        });
      }
      const r = this.risks[cid];
      if (r.sans.score >= 30) {
        alerts.push({
          id: `${cid}-sans`,
          crew: cid,
          severity: band(r.sans.score),
          risk: "sans",
          title: `${last}: optic nerve sheath trending up`,
          detail: r.sans.drivers.join("; ") + ".",
          protocol: "sans",
          ...this._autonomy(60 * 24 * 3),
        });
      }
      if (r.bone.score >= 35) {
        alerts.push({
          id: `${cid}-bone`,
          crew: cid,
          severity: band(r.bone.score),
          risk: "bone",
          title: `${last}: bone loss ahead of plan`,
          detail: r.bone.drivers.join("; ") + ".",
          protocol: "bone",
          ...this._autonomy(60 * 24 * 7),
        });
      }
    }
    if ((this.svb.verdict === "SHIP" || this.svb.verdict === "BOTH") && this.svb.co2_1h > CO2_LIMIT_1H_MMHG) {
      alerts.push({
        id: "ship-co2",
        crew: null,
        severity: "act",
        risk: "hypoxia",
        title: "Cabin CO₂ above the NASA 1-hour limit",
        detail: this.svb.headline + " " + this.svb.evidence.join("; ") + ".",
        protocol: "co2",
        ...this._autonomy(20),
      });
    }
    if (this.svb.rad_ratio > 5) {
      alerts.push({
        id: "ship-rad",
        crew: null,
        severity: "act",
        risk: "cancer",
        title: "Solar particle event: move to storm shelter",
        detail: `Dose rate ${Math.round(this.svb.rad_now).toLocaleString("en-US")} µSv/h (${this.svb.rad_ratio.toFixed(0)}× background).`,
        protocol: "solar",
        ...this._autonomy(15),
      });
    }
    const order = { act: 0, watch: 1, nominal: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity] || Number(a.crew !== null) - Number(b.crew !== null));
    return alerts;
  }

  health_index(cid) {
    const scores = Object.values(this.risks[cid])
      .map((v) => v.score)
      .sort((a, b) => b - a);
    const top = fc.mean(scores.slice(0, 3));
    return Math.max(0, Math.min(100, 100 - 0.75 * top - 0.1 * fc.mean(scores)));
  }

  crew_summary(cid) {
    const a = this.crew[cid];
    const an = this.analyses[cid];
    const r = this.risks[cid];
    const top = Object.entries(r)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3);
    const hi = this.health_index(cid);
    const worst = Math.max(...Object.values(r).map((v) => v.score));
    const last48 = {};
    for (const s of ["hr", "temp", "spo2", "hrv"]) {
      last48[s] = roundArr(a.hourly[s].slice(-48), 2);
    }
    const vitals = {};
    for (const s of HOURLY_SIGNALS) {
      vitals[s] = round(a.hourly[s][a.hourly[s].length - 1], SIGNALS[s].decimals);
    }
    const daily = {};
    for (const [s, arr] of Object.entries(a.daily)) {
      daily[s] = round(arr[arr.length - 1], SIGNALS[s].decimals);
    }
    const zRound = {};
    for (const [k, v] of Object.entries(an.current_z)) zRound[k] = round(v, 2);

    return {
      id: cid,
      name: a.meta.name,
      role: a.meta.role,
      short: a.meta.short,
      age: a.meta.age ?? null,
      bio: a.meta.bio || "",
      source: a.source,
      health_index: round(hi, 1),
      status: band(worst),
      vitals,
      daily,
      spark: last48,
      top_risks: top.map(([k, v]) => ({ id: k, score: round(v.score, 1), band: band(v.score) })),
      attribution: this.svb.per_crew[cid] || {},
      anomaly: {
        score: round(an.anom_score[an.anom_score.length - 1], 2),
        z: zRound,
        infection_pattern: an.infection_now,
        detected_hours_ago: an.detect_hours_ago,
      },
      task: {
        task_in_h: an.task.task_in_h,
        task_relative: an.task.task_relative,
        task_alertness: an.task.task_alertness,
        sleep_debt_3n: an.task.sleep_debt_3n,
      },
    };
  }

  organ_map(cid) {
    const r = this.risks[cid];
    const organs = {};
    for (const risk of HRP_RISKS) {
      const o = risk.organ;
      const sc = r[risk.id].score;
      if (!(o in organs) || sc > organs[o].score) {
        organs[o] = {
          score: sc,
          risk: risk.name,
          driver: (r[risk.id].drivers && r[risk.id].drivers[0]) || "",
        };
      }
    }
    const out = {};
    for (const [k, v] of Object.entries(organs)) {
      out[k] = {
        score: round(v.score, 1),
        band: band(v.score),
        risk: v.risk,
        driver: v.driver,
      };
    }
    return out;
  }

  env_summary() {
    const out = {};
    for (const [s, meta] of Object.entries(ENV_SIGNALS)) {
      const arr = this.env[s];
      out[s] = {
        now: round(arr[arr.length - 1], meta.decimals),
        unit: meta.unit,
        label: meta.label,
        series: roundArr(arr.slice(-72), 3),
        normal: meta.normal,
        threshold: meta.threshold || null,
      };
    }
    return out;
  }

  met() {
    const h = this.hours - 1;
    const day = Math.floor(h / 24);
    const hr = h % 24;
    return {
      day,
      hour: hr,
      label: `MET ${String(day).padStart(3, "0")}/${String(hr).padStart(2, "0")}:00`,
    };
  }
}

const CACHE = new Map();

export function get_state(missionId, scenario = "baseline", overrides = null, uploaded = null, version = 0) {
  const hour = new Date().toISOString().slice(0, 13);
  const key = `${missionId}:${scenario}:${hour}:${version}`;
  let st = CACHE.get(key);
  if (!st) {
    st = new CrewState(missionId, scenario, overrides, uploaded);
    if (CACHE.size > 24) CACHE.clear();
    CACHE.set(key, st);
  }
  return st;
}
