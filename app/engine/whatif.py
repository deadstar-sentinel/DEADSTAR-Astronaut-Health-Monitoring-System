"""
Countermeasure what-if simulator.

Starts from each astronaut's *personal* posterior trend (forecast.bayes_trend)
and rescales it by literature-informed countermeasure effects. Effect sizes are
illustrative estimates for decision support, labelled as such in the UI:

- Resistive/aerobic exercise: bone-loss rate ∝ (1 − 0.45·adherence), muscle ∝ (1 − 0.75·adherence)
- Bisphosphonate + exercise: bone-loss rate × 0.4 (LeBlanc et al. 2013, Osteoporos Int)
- B-vitamin supplement: ONSD growth × 0.75  — hypothesis under test (NASA B-Complex)
- Thigh cuffs: ONSD growth × (1 − 0.025·h/day), max −25 % — hypothesis under test (NASA Thigh Cuff)
- Storm-shelter compliance: solar-particle dose × (1 − 0.7·compliance)
- Sleep: reaction time +14 ms and relative alertness −9 % per hour below 7 h
"""
from __future__ import annotations

import numpy as np

from . import forecast as fc
from .constants import CAREER_DOSE_LIMIT_MSV

SEP_PER_MONTH = 0.5          # assumption: significant SEP events per month near solar maximum
SEP_MEAN_MSV = 15.0          # assumption: unsheltered event dose inside the vehicle


def defaults(an) -> dict:
    d = an.a.daily
    return {
        "exercise_min": float(np.round(np.mean(d["exercise"][-14:]))),
        "sleep_h": float(np.round(np.mean(d["sleep_h"][-7:]), 1)),
        "b_vitamin": False,
        "thigh_cuff_h": 0.0,
        "bisphosphonate": False,
        "shelter": 0.6,
    }


def simulate(an, params: dict) -> dict:
    base = defaults(an)
    p = {**base, **{k: v for k, v in params.items() if k in base}}
    days = an.days_left
    t = np.arange(0, days + 1, dtype=float)

    def adh(ex):
        return min(ex / 150.0, 1.25)

    a0, a1 = adh(base["exercise_min"]), adh(p["exercise_min"])

    # bone
    b_fit = an.dfits["bmd"]
    b_now = float(b_fit["mean"][0])
    b_slope = float(b_fit["mean"][1])
    b_sd = float(np.sqrt(b_fit["cov"][1, 1]))
    f_bone = (1 - 0.45 * a1) / max(1 - 0.45 * a0, 0.05) * (0.4 if p["bisphosphonate"] else 1.0)
    bone_base = b_now + b_slope * t
    bone_new = b_now + b_slope * f_bone * t
    bone_sd = np.sqrt(b_fit["sigma"] ** 2 + (b_sd * t) ** 2 + b_fit["q"] * t)

    # muscle
    m_fit = an.dfits["muscle"]
    m_now, m_slope = float(m_fit["mean"][0]), float(m_fit["mean"][1])
    f_m = (1 - 0.75 * min(a1, 1)) / max(1 - 0.75 * min(a0, 1), 0.05)
    musc_base, musc_new = m_now + m_slope * t, m_now + m_slope * f_m * t

    # aerobic capacity
    v_now = float(an.dfits["vo2"]["mean"][0])
    vo2_new = v_now + (a1 - a0) * 4.0 * (1 - np.exp(-t / 30.0))

    # eyes
    o_fit = an.dfits["onsd"]
    o_now, o_slope = float(o_fit["mean"][0]), float(o_fit["mean"][1])
    o_sd_s = float(np.sqrt(o_fit["cov"][1, 1]))
    f_o = (0.75 if p["b_vitamin"] else 1.0) * (1 - min(0.25, 0.025 * p["thigh_cuff_h"]))
    onsd_base, onsd_new = o_now + o_slope * t, o_now + o_slope * f_o * t
    onsd_sd = np.sqrt(o_fit["sigma"] ** 2 + (o_sd_s * t) ** 2 + o_fit["q"] * t)

    def p_over(mu, sd, thr):
        return float(1 - fc.norm_cdf((thr - mu) / max(sd, 1e-6)))

    # radiation
    rate = an.m["dose_msv_day"]
    dose_now = float(an.a.daily["dose"][-1])
    months = days / 30.0
    sep_base = SEP_PER_MONTH * months * SEP_MEAN_MSV * (1 - 0.7 * base["shelter"])
    sep_new = SEP_PER_MONTH * months * SEP_MEAN_MSV * (1 - 0.7 * p["shelter"])
    dose_base_end = dose_now + rate * days + sep_base
    dose_new_end = dose_now + rate * days + sep_new

    # sleep
    def alert(sl):
        return float(np.clip(100 - 9 * max(0, 7 - sl), 40, 100))

    def pvt(sl):
        return float(248 + 14 * max(0, 7 - sl))

    def pack(base_v, new_v, unit, better="higher", decimals=1):
        return {"baseline": round(float(base_v), decimals), "scenario": round(float(new_v), decimals),
                "delta": round(float(new_v - base_v), decimals), "unit": unit, "better": better}

    out = {
        "params": p, "defaults": base, "days_left": days,
        "end": {
            "bmd": pack(bone_base[-1], bone_new[-1], "% baseline"),
            "p_bone_10": pack(1 - p_over(bone_base[-1], bone_sd[-1], 90.0), 1 - p_over(bone_new[-1], bone_sd[-1], 90.0),
                              "probability", "lower", 3),
            "muscle": pack(musc_base[-1], musc_new[-1], "% baseline"),
            "vo2": pack(v_now, vo2_new[-1], "% baseline"),
            "onsd": pack(onsd_base[-1], onsd_new[-1], "mm", "lower", 2),
            "p_sans": pack(p_over(onsd_base[-1], onsd_sd[-1], 6.0), p_over(onsd_new[-1], onsd_sd[-1], 6.0),
                           "probability", "lower", 3),
            "dose": pack(dose_base_end, dose_new_end, "mSv", "lower", 0),
            "dose_pct": pack(dose_base_end / CAREER_DOSE_LIMIT_MSV * 100, dose_new_end / CAREER_DOSE_LIMIT_MSV * 100,
                             "% of limit", "lower", 1),
            "alertness": pack(alert(base["sleep_h"]), alert(p["sleep_h"]), "% of rested"),
            "pvt": pack(pvt(base["sleep_h"]), pvt(p["sleep_h"]), "ms", "lower", 0),
        },
        "series": {
            "t": t[:: max(1, len(t) // 60)].tolist(),
            "bmd_base": np.round(bone_base[:: max(1, len(t) // 60)], 3).tolist(),
            "bmd_new": np.round(bone_new[:: max(1, len(t) // 60)], 3).tolist(),
            "onsd_base": np.round(onsd_base[:: max(1, len(t) // 60)], 3).tolist(),
            "onsd_new": np.round(onsd_new[:: max(1, len(t) // 60)], 3).tolist(),
        },
        "assumptions": [
            "Exercise effect on bone and muscle scales the astronaut's own measured trend.",
            "Bisphosphonate effect from LeBlanc et al. 2013 (bisphosphonate + resistive exercise).",
            "B-vitamin and thigh-cuff effects are hypotheses under test in ongoing NASA studies.",
            f"Solar particle events: {SEP_PER_MONTH}/month, {SEP_MEAN_MSV:.0f} mSv each if unsheltered.",
        ],
    }
    return out
