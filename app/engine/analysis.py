"""
Orchestrates everything SENTINEL knows about the crew at this hour:
forecasts (with backtests), anomalies, the 17 HRP risk scores, ship-vs-body
attribution, task readiness, alerts with light-delay autonomy, and protocols.
"""
from __future__ import annotations

import math
import threading
import time
from datetime import datetime, timedelta, timezone

import numpy as np

from . import circadian, forecast as fc, orbits
from .constants import (MISSIONS, SIGNALS, ENV_SIGNALS, HOURLY_SIGNALS, FORECAST_DAILY, HRP_RISKS,
                        CAREER_DOSE_LIMIT_MSV, CO2_LIMIT_1H_MMHG, CO2_HEADACHE_7D_MMHG,
                        BMD_LOSS_PER_MONTH_HIP)
from .crew import CREW, generate_crew, generate_env, mission_clock

MAX_H = 168
GROUND_RESPONSE_MIN = 30.0      # assumed time for a ground team to assess and reply


# ----------------------------------------------------------------------------- priors
def daily_prior(sig: str, mission: dict, meta: dict):
    """(prior slope per day, prior sd, window days) — population knowledge, not the hidden truth."""
    g = mission["gravity_g"]
    gp = 1 - 0.6 * g
    if sig == "bmd":
        r = BMD_LOSS_PER_MONTH_HIP * 100 * 0.62 * gp / 30.0      # ~exercise-mitigated population rate
        return -r, r * 0.45, 90
    if sig == "muscle":
        return -0.012 * gp, 0.015, 90
    if sig == "vo2":
        return 0.0, 0.02, 60
    if sig == "onsd":
        return 0.0008 * (1 - 0.5 * g), 0.0012, 90
    if sig == "plasma":
        return 0.0, 0.01, 45
    if sig == "mass":
        return -0.008, 0.01, 60
    if sig == "dose":
        return mission["dose_msv_day"], mission["dose_msv_day"] * 0.08, 30
    if sig in ("glucose",):
        return 0.0, 0.03, 45
    return 0.0, 0.01, 21   # behavioural / daily means: mean-reverting, flat prior


def _process_q(sig, y):
    d = np.diff(y[-60:]) if len(y) > 10 else np.array([1.0])
    s = float(np.std(d)) if len(d) > 2 else 1.0
    if sig in ("bmd", "onsd", "muscle", "vo2", "mass", "dose"):
        return (0.08 * s) ** 2
    return (0.25 * s) ** 2


# ----------------------------------------------------------------------------- per astronaut
class AstronautAnalysis:
    def __init__(self, a, mission: dict, env: dict, owlt_s: float):
        self.a = a
        self.m = mission
        self.env = env
        self.owlt_s = owlt_s
        self.days_left = max(1, mission["duration_days"] - mission["current_day"])
        self._hourly()
        self._daily()
        self._anomaly()
        self._readiness()

    # --- hourly forecasting -------------------------------------------------------
    def _hourly(self):
        self.hmodels, self.hcal, self.hfc = {}, {}, {}
        for s in HOURLY_SIGNALS:
            y = self.a.hourly[s]
            m = fc.HourlyModel(y)
            path = m.predict(MAX_H)
            bt = fc.backtest_hourly(y, max_h=MAX_H) if len(y) >= fc.FIT_DAYS * 24 + MAX_H + 40 else None
            if bt is not None:
                cal = fc.conformal_from_backtest(bt, MAX_H)
                cal["calibrated"] = True
            else:
                h = np.arange(1, MAX_H + 1)
                sd = m.sigma * np.sqrt(1 + h / 24)
                cal = {"q80": fc.Z80 * sd, "q95": fc.Z95 * sd, "mae": 0.8 * sd, "mae_naive": sd,
                       "coverage80": None, "coverage95": None, "n_origins": 0, "n_eval": 0, "calibrated": False}
            self.hmodels[s], self.hcal[s], self.hfc[s] = m, cal, path

    # --- daily forecasting --------------------------------------------------------
    def _daily(self):
        self.dfits, self.dbt = {}, {}
        for s in FORECAST_DAILY:
            y = self.a.daily[s]
            ps, psd, win = daily_prior(s, self.m, self.a.meta)
            q = _process_q(s, y)
            self.dfits[s] = fc.bayes_trend(y, ps, psd, window=win, process_q=q)
            self.dbt[s] = fc.backtest_daily(y, ps, psd, win, q=q)
        # daily means of hourly signals for long horizons
        D = self.a.hours // 24
        for s in HOURLY_SIGNALS:
            y = self.a.hourly[s][: D * 24].reshape(D, 24).mean(axis=1)
            q = _process_q(s, y)
            self.dfits["dm_" + s] = fc.bayes_trend(y, 0.0, 0.01, window=21, process_q=q)
            self.dbt["dm_" + s] = fc.backtest_daily(y, 0.0, 0.01, 21, q=q)

    # --- anomaly detection ---------------------------------------------------------
    def _anomaly(self):
        """Circadian- and sleep-adjusted robust z-scores, then multi-signal pattern matching.

        Expected value at hour t = the astronaut's own hour-of-day profile (last 14 days,
        excluding the last 48 h) + beta x (asleep fraction - typical asleep fraction at that hour).
        The sleep term comes from actigraphy, so a shifted bedtime is not mistaken for illness.
        """
        H = self.a.hours
        base_end = H - 48
        base_start = max(0, base_end - 14 * 24)
        look = min(168, H - base_start - 24)
        sigs = ["hr", "hrv", "temp", "rr", "spo2"]
        sl = self.a.asleep
        hods_b = np.arange(base_start, base_end) % 24
        sl_prof = np.array([np.mean(sl[base_start:base_end][hods_b == h]) for h in range(24)])
        idx = np.arange(H - look, H)
        Z = {}
        for s in sigs:
            y = self.a.hourly[s]
            seg = y[base_start:base_end]
            prof = np.array([np.median(seg[hods_b == h]) for h in range(24)])
            ds = sl[base_start:base_end] - sl_prof[hods_b]
            r0 = seg - prof[hods_b]
            beta = float(np.dot(ds, r0) / (np.dot(ds, ds) or 1e-9))
            res = r0 - beta * ds
            scale = 1.4826 * np.median(np.abs(res - np.median(res))) or 1e-6
            r = (y[idx] - prof[idx % 24] - beta * (sl[idx] - sl_prof[idx % 24])) / scale
            k = np.ones(6) / 6
            Z[s] = np.convolve(r, k, mode="full")[: len(r)]
        self.z = Z
        self.z_index = idx
        zz = np.vstack([Z[s] for s in sigs])
        self.anom_score = np.sqrt(np.mean(np.clip(np.abs(zz), 0, 8) ** 2, axis=0))
        sig_inf = (Z["temp"] > 1.8) & (Z["hr"] > 1.2) & (Z["hrv"] < -1.0)
        run = np.zeros(len(sig_inf), dtype=int)
        for j in range(len(sig_inf)):
            run[j] = (run[j - 1] + 1) if (sig_inf[j] and j > 0) else int(sig_inf[j])
        self.infection_now = bool(run[-1] >= 3)
        detect = None
        for j in range(max(0, len(run) - 72), len(run)):
            if run[j] >= 3:
                detect = j - 2
                break
        if not self.infection_now:
            detect = None
        self.detect_hours_ago = (len(run) - 1 - detect) if detect is not None else None
        self.current_z = {s: float(Z[s][-1]) for s in sigs}
        tt = self.a.hourly["temp"][H - 72:]
        hit = np.where(tt >= 38.0)[0]
        self.first_breach_hours_ago = int(72 - 1 - hit[0]) if len(hit) else None

    # --- task readiness ---------------------------------------------------------------
    def _readiness(self):
        now_clock = self.a.now_index % 24
        task_clock = 9.0
        ahead = (task_clock - now_clock) % 24
        if ahead < 4:
            ahead += 24
        self.task = circadian.readiness(self.a, ahead)

    # --- public views --------------------------------------------------------------------
    def hourly_forecast(self, s: str, horizon: int):
        horizon = min(horizon, MAX_H)
        y = self.a.hourly[s]
        cal = self.hcal[s]
        path = self.hfc[s][:horizon]
        q80, q95 = cal["q80"][:horizon], cal["q95"][:horizon]
        hist = y[-min(len(y), max(48, horizon)):]
        out = {
            "signal": s, "resolution": "hour", "horizon": horizon,
            "history": np.round(hist, 3).tolist(),
            "history_start": -len(hist) + 1,
            "mean": np.round(path, 3).tolist(),
            "lo80": np.round(path - q80, 3).tolist(), "hi80": np.round(path + q80, 3).tolist(),
            "lo95": np.round(path - q95, 3).tolist(), "hi95": np.round(path + q95, 3).tolist(),
            "calibrated": cal["calibrated"],
            "backtest": {
                "n_origins": cal["n_origins"], "n_eval": cal["n_eval"],
                "coverage80": cal["coverage80"], "coverage95": cal["coverage95"],
                "horizons": fc.horizon_summary(cal, [h for h in (1, 6, 24, 48, 72, 168) if h <= MAX_H]),
            },
        }
        thr = SIGNALS[s].get("threshold")
        if thr:
            probs = [fc.exceed_prob(mu, q, thr["value"], thr["dir"]) for mu, q in zip(path, q80)]
            k = int(np.argmax(probs))
            out["threshold"] = {**thr, "peak_prob": float(probs[k]), "peak_in_h": k + 1,
                                "probs": np.round(probs, 4).tolist()}
            cross = next((j + 1 for j, mu in enumerate(path)
                          if (mu >= thr["value"] if thr["dir"] == "above" else mu <= thr["value"])), None)
            out["threshold"]["mean_crosses_in_h"] = cross
        return out

    def daily_forecast(self, s: str, horizon_days: int):
        key = s if s in self.dfits else "dm_" + s
        fit = self.dfits[key]
        y = self.a.daily[s] if s in self.a.daily else \
            self.a.hourly[s][: (self.a.hours // 24) * 24].reshape(-1, 24).mean(axis=1)
        mu, sd = fc.bayes_predict(fit, horizon_days)
        hist = y[-min(len(y), max(30, horizon_days)):]
        bt = self.dbt.get(key, {})
        out = {
            "signal": s, "resolution": "day", "horizon": horizon_days,
            "history": np.round(hist, 4).tolist(), "history_start": -len(hist) + 1,
            "mean": np.round(mu, 4).tolist(),
            "lo80": np.round(mu - fc.Z80 * sd, 4).tolist(), "hi80": np.round(mu + fc.Z80 * sd, 4).tolist(),
            "lo95": np.round(mu - fc.Z95 * sd, 4).tolist(), "hi95": np.round(mu + fc.Z95 * sd, 4).tolist(),
            "slope_per_day": float(fit["mean"][1]), "slope_sd": float(math.sqrt(fit["cov"][1, 1])),
            "prior_slope": fit["prior_slope"], "prior_sd": fit["prior_sd"], "n": fit["n"],
            "backtest": {str(k): v for k, v in (bt or {}).items()},
            "mission_days_left": self.days_left,
        }
        backtested = any(v for v in (bt or {}).values())
        longest = max([int(k) for k, v in (bt or {}).items() if v] or [0])
        out["evidence"] = "backtested" if backtested and horizon_days <= longest else \
            ("partly backtested" if backtested else "prior-dominated")
        thr = SIGNALS[s].get("threshold")
        if thr:
            probs = []
            for m_, s_ in zip(mu, sd):
                z = (thr["value"] - m_) / max(s_, 1e-6)
                p_above = 1 - fc.norm_cdf(z)
                probs.append(p_above if thr["dir"] == "above" else 1 - p_above)
            out["threshold"] = {**thr, "prob_at_horizon": float(probs[-1]),
                                "probs": np.round(probs, 4).tolist()}
        return out

    def end_of_mission(self, s: str):
        fit = self.dfits[s]
        mu, sd = fc.bayes_predict(fit, self.days_left)
        return float(mu[-1]), float(sd[-1])


# ----------------------------------------------------------------------------- crew level
def ship_vs_body(analyses: dict, env: dict, mission: dict):
    co2 = env["co2"]
    co2_1h = float(co2[-1])
    co2_7d = float(np.mean(co2[-168:]))
    base_rad = mission["dose_msv_day"] * 1000 / 24.0
    rad_now = float(env["rad_rate"][-1])
    rad_ratio = rad_now / base_rad
    evidence, per = [], {}
    ventil = {cid: (an.current_z["rr"] > 1.6 and an.current_z["hr"] > 0.8) for cid, an in analyses.items()}
    n_vent = sum(ventil.values())
    ship_co2 = co2_1h > CO2_LIMIT_1H_MMHG
    ship_rad = rad_ratio > 5
    for cid, an in analyses.items():
        attrib, reason = "none", ""
        if ship_co2 and ventil[cid]:
            attrib, reason = "ship", f"Breathing and heart rate up together with cabin CO₂ at {co2_1h:.1f} mmHg"
        if an.infection_now or (an.detect_hours_ago is not None):
            if attrib == "ship":
                attrib, reason = "both", reason + "; plus an infection-like pattern the cabin cannot explain"
            else:
                attrib, reason = "body", "Temperature, heart rate and HRV moving together with normal cabin air"
        per[cid] = {"attribution": attrib, "reason": reason}
    if ship_co2:
        evidence.append(f"Cabin ppCO₂ {co2_1h:.2f} mmHg (1-h limit {CO2_LIMIT_1H_MMHG:.0f} mmHg, NASA-STD-3001)")
        evidence.append(f"{n_vent} of {len(analyses)} crew show raised breathing and heart rate at the same time")
    if co2_7d > CO2_HEADACHE_7D_MMHG:
        evidence.append(f"7-day mean ppCO₂ {co2_7d:.2f} mmHg above the 2.5 mmHg headache-risk line")
    if ship_rad:
        evidence.append(f"Dose rate {rad_now:,.0f} µSv/h, {rad_ratio:.0f}× the mission background")
    bodies = [cid for cid, p in per.items() if p["attribution"] in ("body", "both")]
    if (ship_co2 or ship_rad) and bodies:
        verdict = "BOTH"
    elif ship_co2 or ship_rad:
        verdict = "SHIP"
    elif bodies:
        verdict = "BODY"
    else:
        verdict = "NOMINAL"
    names = {c["id"]: c["name"].split()[-1] for c in CREW}
    if verdict == "SHIP" and ship_co2:
        headline = f"It's the ship, not the crew: cabin CO₂ is {co2_1h:.1f} mmHg."
    elif verdict == "SHIP":
        headline = "It's the ship's environment: radiation storm in progress."
    elif verdict == "BOTH":
        b = ", ".join(names[c] for c in bodies)
        cause = f"cabin CO₂ {co2_1h:.1f} mmHg" if ship_co2 else "a radiation storm"
        headline = f"Two separate problems: {cause} for the whole crew, and {b}'s own physiology."
    elif verdict == "BODY":
        b = ", ".join(names[c] for c in bodies)
        headline = f"It's {b}'s body, not the ship: cabin air and radiation are nominal."
    else:
        headline = "Ship and crew nominal."
    return {"verdict": verdict, "headline": headline, "evidence": evidence, "per_crew": per,
            "co2_1h": co2_1h, "co2_7d": co2_7d, "rad_now": rad_now, "rad_ratio": rad_ratio}


def risk_scores(an: AstronautAnalysis, crew_mood_sd: float, svb: dict):
    a, m = an.a, an.m
    d = a.daily
    day = m["current_day"]
    out = {}

    def put(rid, score, drivers, recommendation):
        out[rid] = {"score": float(np.clip(score, 0, 100)), "drivers": drivers, "recommendation": recommendation}

    z = an.current_z
    inf = 0.0
    if an.infection_now:
        inf = 72 + 6 * min(4, z["temp"] - 2)
    elif an.detect_hours_ago is not None:
        inf = 60
    debt = an.task["sleep_debt_3n"]
    put("immune", max(inf, 12 + 4 * debt),
        [f"Temp z {z['temp']:+.1f}, HR z {z['hr']:+.1f}, HRV z {z['hrv']:+.1f}"] +
        ([f"Infection-like pattern detected {an.detect_hours_ago} h ago"] if an.detect_hours_ago is not None else []),
        "Repeat temperature, saliva swab for viral reactivation, protect sleep")
    put("sensorimotor", 8 + 60 * math.exp(-day / 5) + (35 if an.days_left < 10 else 0),
        [f"Mission day {day}; {an.days_left} days to next gravity transition"],
        "Vestibular checks before and after gravity transitions")
    plasma = float(d["plasma"][-1])
    put("cardio", 8 + 1.1 * max(0, 100 - plasma) + 3 * max(0, z["hr"]),
        [f"Plasma volume {plasma:.0f} % of baseline", f"HR z {z['hr']:+.1f}"],
        "Fluid loading and orthostatic countermeasures before landing")
    eva = m["eva"]
    put("dcs", 18 if eva else 4, ["EVA schedule active" if eva else "No EVA in this mission phase"],
        "Prebreathe protocol before EVA")
    put("microbe", 10 + 0.3 * inf, ["Closed habitat, shared air and water"], "Surface sampling, hand hygiene")
    spo2 = float(np.mean(a.hourly["spo2"][-6:]))
    put("hypoxia", 6 + max(0, 96.5 - spo2) * 22, [f"SpO₂ {spo2:.1f} % (6-h mean)"], "Check cabin ppO₂ and suit O₂")
    mass_loss = (d["mass"][0] - d["mass"][-1]) / d["mass"][0] * 100
    glu = float(d["glucose"][-1])
    put("nutrition", 8 + 6 * max(0, mass_loss) + max(0, glu - 100) * 1.2,
        [f"Body mass {mass_loss:+.1f} % since launch", f"Fasting glucose {glu:.0f} mg/dL"],
        "Energy intake review; vitamin D and calcium")
    musc = float(d["muscle"][-1])
    put("eva", (22 if eva else 5) + max(0, 100 - an.task["task_relative"]) * 0.4 + max(0, 100 - musc) * 0.8,
        [f"Task readiness {an.task['task_relative']:.0f} %", f"Leg strength {musc:.0f} %"],
        "Fatigue check before suited operations")
    vo2 = float(d["vo2"][-1])
    put("fitness", 6 + 2.6 * max(0, 100 - vo2) + 2.0 * max(0, 100 - musc),
        [f"VO₂max {vo2:.0f} % of baseline", f"Leg strength {musc:.0f} %"],
        "Maintain aerobic and resistive exercise prescriptions")
    o_mu, o_sd = an.end_of_mission("onsd")
    p_sans = 1 - fc.norm_cdf((6.0 - o_mu) / max(o_sd, 1e-6))
    put("sans", 5 + 90 * p_sans,
        [f"ONSD {d['onsd'][-1]:.2f} mm now, {o_mu:.2f} ± {o_sd:.2f} mm at mission end",
         f"P(ONSD ≥ 6.0 mm by mission end) {p_sans:.0%}"],
        "Optic ultrasound and OCT; B-Complex and thigh-cuff protocols (investigational)")
    b_mu, b_sd = an.end_of_mission("bmd")
    p_bone = fc.norm_cdf((90.0 - b_mu) / max(b_sd, 1e-6))
    loss_end = 100 - b_mu
    put("bone", 4 + 4.0 * max(0, loss_end) + 40 * p_bone,
        [f"Hip BMD {d['bmd'][-1]:.1f} % now, {b_mu:.1f} ± {b_sd:.1f} % at mission end",
         f"P(≥10 % loss by mission end) {p_bone:.0%}"],
        "Resistive exercise loading; bisphosphonate if the flight surgeon agrees")
    mood = float(np.mean(d["mood"][-3:]))
    put("behavior", 6 + max(0, 78 - mood) * 1.8 + min(20, day / 15),
        [f"Mood index {mood:.0f} (3-day mean)", f"Mission day {day} in isolation"],
        "Private conferences, schedule autonomy, Earth-view time")
    owlt_min = an.owlt_s / 60
    put("teamwork", 8 + crew_mood_sd * 1.5 + min(20, owlt_min * 1.2),
        [f"Crew mood spread ±{crew_mood_sd:.0f}", f"{owlt_min:.1f} min one-way delay to ground"],
        "Structured debriefs; autonomy-supporting procedures")
    pvt = float(d["pvt"][-1])
    put("sleep", 6 + debt * 9 + max(0, pvt - 280) * 0.35,
        [f"Sleep debt {debt:.1f} h over 3 nights", f"Reaction time {pvt:.0f} ms"],
        "Protect the next sleep period; light and caffeine strategy")
    put("systems", 8 + min(30, owlt_min * 2.2),
        [f"Ground support delayed {2 * owlt_min:.0f} min round trip"],
        "Onboard procedures and decision support (this system)")
    put("dynamic", 5 + (45 if an.days_left < 14 else 0) + max(0, 100 - musc) * 0.5,
        [f"{an.days_left} days to landing", f"Leg strength {musc:.0f} %"],
        "Seat fit and landing-load countermeasures")
    dose_now = float(d["dose"][-1])
    dmu, dsd = an.end_of_mission("dose")
    put("cancer", 60 * (dmu / CAREER_DOSE_LIMIT_MSV) ** 1.5,
        [f"Dose {dose_now:.0f} mSv now, {dmu:.0f} mSv projected at mission end",
         f"{dmu / CAREER_DOSE_LIMIT_MSV:.0%} of the 600 mSv career limit"],
        "Storm shelter discipline during solar particle events")
    if svb["per_crew"].get(a.meta["id"], {}).get("attribution") in ("ship", "both"):
        out["hypoxia"]["score"] = max(out["hypoxia"]["score"], 55)
        out["hypoxia"]["drivers"].insert(0, f"Cabin ppCO₂ {svb['co2_1h']:.1f} mmHg")
    return out


def band(score):
    return "act" if score >= 60 else ("watch" if score >= 30 else "nominal")


# ----------------------------------------------------------------------------- the crew state
class CrewState:
    def __init__(self, mission_id: str, scenario: str = "baseline", overrides: dict | None = None,
                 uploaded: dict | None = None):
        t_start = time.time()
        self.mission = MISSIONS[mission_id]
        self.scenario = scenario
        self.t0, self.hours, self.now = mission_clock(mission_id)
        self.crew = generate_crew(mission_id, scenario=scenario)
        if uploaded:
            for cid, data in uploaded.items():
                self.crew[cid] = data
        for (cid, sig), val in (overrides or {}).items():
            if cid in self.crew and sig in self.crew[cid].daily:
                self.crew[cid].daily[sig] = self.crew[cid].daily[sig].copy()
                self.crew[cid].daily[sig][-1] = val
        self.env = generate_env(mission_id, scenario=scenario)
        self.light = orbits.light_time(self.mission)
        self.analyses = {cid: AstronautAnalysis(a, self.mission, self.env, self.light["owlt_s"])
                         for cid, a in self.crew.items()}
        moods = [float(np.mean(a.daily["mood"][-3:])) for a in self.crew.values()]
        self.crew_mood_sd = float(np.std(moods))
        self.svb = ship_vs_body(self.analyses, self.env, self.mission)
        self.risks = {cid: risk_scores(an, self.crew_mood_sd, self.svb) for cid, an in self.analyses.items()}
        self.alerts = self._alerts()
        self.compute_s = round(time.time() - t_start, 2)

    # ------------------------------------------------------------------ alerts + autonomy
    def _autonomy(self, act_within_min):
        rt = 2 * self.light["owlt_s"] / 60
        earth_reply = rt + GROUND_RESPONSE_MIN
        auto = earth_reply > act_within_min or self.light.get("blackout")
        return {"act_within_min": act_within_min, "earth_round_trip_min": round(rt, 1),
                "earth_reply_min": round(earth_reply, 1), "autonomous": bool(auto)}

    def _alerts(self):
        alerts = []
        names = {c["id"]: c for c in CREW}
        for cid, an in self.analyses.items():
            meta = names.get(cid, an.a.meta)
            last = meta["name"].split()[-1]
            if an.detect_hours_ago is not None or an.infection_now:
                tf = an.hourly_forecast("temp", 24)
                p = tf["threshold"]["peak_prob"]
                cross = tf["threshold"].get("mean_crosses_in_h")
                lead = an.detect_hours_ago
                lead_total = (lead + cross) if (lead is not None and cross) else None
                alerts.append({
                    "id": f"{cid}-immune", "crew": cid, "severity": "act", "risk": "immune",
                    "title": f"{last}: infection-like pattern",
                    "detail": (f"Core temperature, heart rate and HRV have drifted together for {lead} h. "
                               f"P(fever ≥ 38.0 °C within 24 h) = {p:.0%}"
                               + (f"; mean forecast crosses 38.0 °C in {cross} h." if cross else ".")),
                    "detected_hours_ago": lead, "lead_hours": lead_total, "fever_in_h": cross,
                    "fever_prob_24h": p, "first_breach_hours_ago": an.first_breach_hours_ago,
                    "protocol": "infection", **self._autonomy(45),
                })
            tr = an.task
            if tr["task_relative"] < 78:
                sev = "act" if tr["task_relative"] < 70 else "watch"
                task_name = "EVA" if self.mission["eva"] else "manual trajectory-correction oversight"
                alerts.append({
                    "id": f"{cid}-sleep", "crew": cid, "severity": sev, "risk": "sleep",
                    "title": f"{last}: reduced readiness for {task_name} at 09:00",
                    "detail": (f"Predicted alertness at task time {tr['task_relative']:.0f} % of a well-rested "
                               f"baseline (two-process model). Sleep debt {tr['sleep_debt_3n']:.1f} h over 3 nights."),
                    "protocol": "fatigue", **self._autonomy(240),
                })
            r = self.risks[cid]
            if r["sans"]["score"] >= 30:
                alerts.append({
                    "id": f"{cid}-sans", "crew": cid, "severity": band(r["sans"]["score"]), "risk": "sans",
                    "title": f"{last}: optic nerve sheath trending up",
                    "detail": "; ".join(r["sans"]["drivers"]) + ".",
                    "protocol": "sans", **self._autonomy(60 * 24 * 3),
                })
            if r["bone"]["score"] >= 35:
                alerts.append({
                    "id": f"{cid}-bone", "crew": cid, "severity": band(r["bone"]["score"]), "risk": "bone",
                    "title": f"{last}: bone loss ahead of plan",
                    "detail": "; ".join(r["bone"]["drivers"]) + ".",
                    "protocol": "bone", **self._autonomy(60 * 24 * 7),
                })
        if self.svb["verdict"] in ("SHIP", "BOTH") and self.svb["co2_1h"] > CO2_LIMIT_1H_MMHG:
            alerts.append({
                "id": "ship-co2", "crew": None, "severity": "act", "risk": "hypoxia",
                "title": "Cabin CO₂ above the NASA 1-hour limit",
                "detail": self.svb["headline"] + " " + "; ".join(self.svb["evidence"]) + ".",
                "protocol": "co2", **self._autonomy(20),
            })
        if self.svb["rad_ratio"] > 5:
            alerts.append({
                "id": "ship-rad", "crew": None, "severity": "act", "risk": "cancer",
                "title": "Solar particle event: move to storm shelter",
                "detail": f"Dose rate {self.svb['rad_now']:,.0f} µSv/h ({self.svb['rad_ratio']:.0f}× background).",
                "protocol": "solar", **self._autonomy(15),
            })
        order = {"act": 0, "watch": 1, "nominal": 2}
        alerts.sort(key=lambda x: (order[x["severity"]], x["crew"] is not None))
        return alerts

    # ------------------------------------------------------------------ summaries
    def health_index(self, cid):
        scores = sorted((v["score"] for v in self.risks[cid].values()), reverse=True)
        top = np.mean(scores[:3])
        return float(np.clip(100 - 0.75 * top - 0.1 * np.mean(scores), 0, 100))

    def crew_summary(self, cid):
        a = self.crew[cid]
        an = self.analyses[cid]
        r = self.risks[cid]
        top = sorted(r.items(), key=lambda kv: -kv[1]["score"])[:3]
        hi = self.health_index(cid)
        worst = max(v["score"] for v in r.values())
        last48 = {s: np.round(a.hourly[s][-48:], 2).tolist() for s in ("hr", "temp", "spo2", "hrv")}
        return {
            "id": cid, "name": a.meta["name"], "role": a.meta["role"], "short": a.meta["short"],
            "age": a.meta.get("age"), "bio": a.meta.get("bio", ""), "source": a.source,
            "health_index": round(hi, 1), "status": band(worst),
            "vitals": {s: round(float(a.hourly[s][-1]), SIGNALS[s]["decimals"]) for s in HOURLY_SIGNALS},
            "daily": {s: round(float(a.daily[s][-1]), SIGNALS[s]["decimals"]) for s in a.daily},
            "spark": last48,
            "top_risks": [{"id": k, "score": round(v["score"], 1), "band": band(v["score"])} for k, v in top],
            "attribution": self.svb["per_crew"].get(cid, {}),
            "anomaly": {"score": round(float(an.anom_score[-1]), 2), "z": {k: round(v, 2) for k, v in an.current_z.items()},
                        "infection_pattern": an.infection_now, "detected_hours_ago": an.detect_hours_ago},
            "task": {k: an.task[k] for k in ("task_in_h", "task_relative", "task_alertness", "sleep_debt_3n")},
        }

    def organ_map(self, cid):
        r = self.risks[cid]
        organs = {}
        for risk in HRP_RISKS:
            o = risk["organ"]
            sc = r[risk["id"]]["score"]
            if o not in organs or sc > organs[o]["score"]:
                organs[o] = {"score": sc, "risk": risk["name"], "driver": (r[risk["id"]]["drivers"] or [""])[0]}
        return {k: {"score": round(v["score"], 1), "band": band(v["score"]), "risk": v["risk"], "driver": v["driver"]}
                for k, v in organs.items()}

    def env_summary(self):
        e = self.env
        out = {}
        for s, meta in ENV_SIGNALS.items():
            arr = e[s]
            out[s] = {"now": round(float(arr[-1]), meta["decimals"]), "unit": meta["unit"], "label": meta["label"],
                      "series": np.round(arr[-72:], 3).tolist(), "normal": meta["normal"],
                      "threshold": meta.get("threshold")}
        return out

    def met(self):
        h = self.hours - 1
        return {"day": h // 24, "hour": h % 24, "label": f"MET {h // 24:03d}/{h % 24:02d}:00"}


# ----------------------------------------------------------------------------- cache
_CACHE: dict = {}
_LOCK = threading.Lock()


def get_state(mission_id: str, scenario: str = "baseline", overrides: dict | None = None,
              uploaded: dict | None = None, version: int = 0) -> CrewState:
    hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    key = (mission_id, scenario, hour, version)
    with _LOCK:
        st = _CACHE.get(key)
    if st is None:
        st = CrewState(mission_id, scenario, overrides, uploaded)
        with _LOCK:
            if len(_CACHE) > 24:
                _CACHE.clear()
            _CACHE[key] = st
    return st
