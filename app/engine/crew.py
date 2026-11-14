"""
Synthetic crew generator.

Real astronaut medical records are private, so SENTINEL runs on a synthetic
crew whose physiology is calibrated to NASA-published rates (constants.py).
Each astronaut has an individual baseline plus a storyline that plays out in
the most recent hours/days, so the demo always shows a live situation:

  vasquez  CDR  chronic sleep restriction before a critical task; faster bone loss
  mori     FE   latent-virus reactivation building over the last ~30 h (HRP immune risk)
  haddad   MO   nominal reference astronaut
  novak    MS   progressive optic nerve sheath swelling (SANS)

History ends at the current UTC hour, so the console is always "now".
Uploaded real data (ingest.py) replaces these streams.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np

from .constants import MISSIONS, HOURLY_SIGNALS, DAILY_SIGNALS

CREW = [
    {
        "id": "vasquez", "name": "Elena Vasquez", "role": "Commander", "short": "CDR",
        "age": 46, "sex": "F", "mass0": 62.0, "hr0": 57.0, "hrv0": 49.0, "sbp0": 112.0, "dbp0": 71.0,
        "temp0": 36.42, "rr0": 13.5, "spo2_0": 97.9, "sleep0": 6.3, "onset0": 23.2,
        "exercise0": 112.0, "onsd0": 4.86, "onsd_rate": 0.0006, "story": "sleep_debt",
        "bio": "Mission commander, test pilot. Third long-duration flight.",
    },
    {
        "id": "mori", "name": "Kenji Mori", "role": "Flight Engineer", "short": "FE",
        "age": 39, "sex": "M", "mass0": 73.5, "hr0": 60.0, "hrv0": 57.0, "sbp0": 118.0, "dbp0": 76.0,
        "temp0": 36.48, "rr0": 14.0, "spo2_0": 98.0, "sleep0": 6.4, "onset0": 22.6,
        "exercise0": 152.0, "onsd0": 4.95, "onsd_rate": 0.0005, "story": "infection",
        "bio": "Systems engineer, life-support specialist. First long-duration flight.",
    },
    {
        "id": "haddad", "name": "Layla Haddad", "role": "Medical Officer", "short": "MO",
        "age": 41, "sex": "F", "mass0": 57.8, "hr0": 62.0, "hrv0": 54.0, "sbp0": 110.0, "dbp0": 69.0,
        "temp0": 36.45, "rr0": 14.5, "spo2_0": 98.1, "sleep0": 6.7, "onset0": 22.4,
        "exercise0": 158.0, "onsd0": 4.78, "onsd_rate": 0.0003, "story": "nominal",
        "bio": "Emergency physician and crew medical officer.",
    },
    {
        "id": "novak", "name": "Tomas Novak", "role": "Mission Specialist", "short": "MS",
        "age": 44, "sex": "M", "mass0": 81.2, "hr0": 59.0, "hrv0": 46.0, "sbp0": 121.0, "dbp0": 78.0,
        "temp0": 36.40, "rr0": 13.8, "spo2_0": 97.7, "sleep0": 6.2, "onset0": 22.9,
        "exercise0": 145.0, "onsd0": 5.00, "onsd_rate": 0.0037, "story": "sans",
        "bio": "Planetary geologist. Surface science lead.",
    },
]
CREW_BY_ID = {c["id"]: c for c in CREW}

# Storyline timing (hours before "now")
INFECTION_ONSET_H = 27
INFECTION_RAMP_H = 48.0
SLEEP_DEBT_NIGHTS = 5


@dataclass
class AstronautData:
    meta: dict
    t0: datetime                       # mission start (UTC, midnight)
    hours: int                         # number of hourly samples
    hourly: dict = field(default_factory=dict)   # signal -> np.ndarray[hours]
    daily: dict = field(default_factory=dict)    # signal -> np.ndarray[days]
    asleep: np.ndarray | None = None   # fraction of each hour asleep
    sleep_windows: list = field(default_factory=list)  # [(start_h, end_h)] absolute hour index
    source: str = "synthetic"

    @property
    def days(self) -> int:
        return len(next(iter(self.daily.values())))

    @property
    def now_index(self) -> int:
        return self.hours - 1


def _rng(*parts) -> np.random.Generator:
    return np.random.default_rng(zlib.crc32(":".join(map(str, parts)).encode()))


def _ar1(rng, n, phi, sigma):
    e = rng.normal(0, sigma * np.sqrt(1 - phi ** 2), n)
    out = np.empty(n)
    acc = rng.normal(0, sigma)
    for i in range(n):
        acc = phi * acc + e[i]
        out[i] = acc
    return out


def infection_severity(hours: int) -> np.ndarray:
    """0..1 severity of the infection storyline for each hour (Mori)."""
    i = np.arange(hours)
    onset = hours - 1 - INFECTION_ONSET_H
    x = np.clip((i - onset) / INFECTION_RAMP_H, 0, 1)
    return x ** 1.3


def mission_clock(mission_id: str, now: datetime | None = None):
    m = MISSIONS[mission_id]
    now = (now or datetime.now(timezone.utc)).replace(minute=0, second=0, microsecond=0)
    day = m["current_day"]
    t0 = now.replace(hour=0) - timedelta(days=day)
    hours = day * 24 + now.hour + 1
    return t0, hours, now


def generate_astronaut(meta: dict, mission_id: str, now: datetime | None = None,
                       scenario: str = "baseline") -> AstronautData:
    m = MISSIONS[mission_id]
    t0, H, _ = mission_clock(mission_id, now)
    D = H // 24 + 1                    # days 0..today
    rng = _rng(mission_id, meta["id"], "v3")
    story = meta["story"]

    i = np.arange(H)
    hod = i % 24
    day = i // 24
    g = m["gravity_g"]

    # --- daily behavioural drivers ------------------------------------------------
    exercise = np.clip(rng.normal(meta["exercise0"], 14, D), 40, 220)
    sleep_h = np.clip(rng.normal(meta["sleep0"], 0.55, D), 4.0, 8.6)
    onset = rng.normal(meta["onset0"], 0.35, D)
    if story == "sleep_debt":
        sleep_h[-SLEEP_DEBT_NIGHTS:] = np.clip(rng.normal(4.7, 0.25, SLEEP_DEBT_NIGHTS), 4.0, 5.3)
        onset[-SLEEP_DEBT_NIGHTS:] = rng.normal(25.1, 0.3, SLEEP_DEBT_NIGHTS)   # ~01:00
    if story == "infection":
        sleep_h[-2:] = np.clip(sleep_h[-2:] - 1.1, 4.2, 8)
    if scenario == "fatigue":
        srng = _rng(mission_id, meta["id"], "fatigue")
        sleep_h[-4:] = np.minimum(sleep_h[-4:], np.clip(srng.normal(4.6, 0.25, 4), 4.0, 5.2))
        onset[-4:] = np.maximum(onset[-4:], srng.normal(24.9, 0.3, 4))

    # --- sleep / exercise masks (fraction of each hour) --------------------------
    asleep = np.zeros(H)
    windows = []
    for d in range(1, D):
        start = (d - 1) * 24 + onset[d]
        end = start + sleep_h[d]
        windows.append((float(start), float(end)))
        lo, hi = int(np.floor(start)), int(np.ceil(end))
        for k in range(max(lo, 0), min(hi, H)):
            asleep[k] = max(0.0, min(k + 1, end) - max(k, start))
    exercising = np.zeros(H)
    for k in range(H):
        d = k // 24
        half = exercise[min(d, D - 1)] / 2 / 60.0       # hours per session
        h = k % 24
        for s in (10, 15):
            if s <= h < s + np.ceil(half):
                exercising[k] = min(1.0, half - (h - s))

    circ = np.cos(2 * np.pi * (hod - 16.0) / 24)        # alertness/HR rhythm
    circ_t = np.cos(2 * np.pi * (hod - 18.0) / 24)      # core temperature rhythm
    adapt = 1 - np.exp(-day / 14.0)                      # microgravity adaptation
    infect = infection_severity(H) if story == "infection" else np.zeros(H)

    co2_resp = np.zeros(H)
    if scenario == "co2":
        co2_resp = np.clip((i - (H - 1 - 6)) / 6.0, 0, 1)
    hourly = {}
    hourly["hr"] = 4.5 * co2_resp +  (meta["hr0"] + 5.0 * circ - 7.0 * asleep + 38.0 * exercising
                    + 2.5 * adapt * (1 - g) + 18.0 * infect + _ar1(rng, H, 0.7, 2.2))
    hourly["hrv"] = np.clip(meta["hrv0"] * (1 + 0.28 * asleep - 0.10 * circ - 0.45 * exercising)
                            * (1 - 0.5 * infect) + _ar1(rng, H, 0.6, 4.0), 8, None)
    hourly["spo2"] = np.clip(meta["spo2_0"] - 0.35 * asleep - 0.9 * infect
                             + _ar1(rng, H, 0.5, 0.35), 88, 100)
    hourly["rr"] = 2.8 * co2_resp + (meta["rr0"] + 0.8 * circ - 1.6 * asleep + 7.0 * exercising + 3.2 * infect
                    + _ar1(rng, H, 0.5, 0.55))
    fever_drift = 0.55 * (1 - np.exp(-day / 45.0))        # space fever (Stahn 2017)
    hourly["temp"] = (meta["temp0"] + 0.30 * circ_t - 0.20 * asleep + 0.28 * exercising
                      + fever_drift + 1.15 * infect + _ar1(rng, H, 0.85, 0.07))
    hourly["sbp"] = (meta["sbp0"] - 4.0 * adapt * (1 - g) + 6.0 * circ - 10.0 * asleep
                     + 16.0 * exercising + 4.0 * infect + _ar1(rng, H, 0.6, 4.0))
    hourly["dbp"] = (meta["dbp0"] - 2.5 * adapt * (1 - g) + 3.5 * circ - 7.0 * asleep
                     + 6.0 * exercising + _ar1(rng, H, 0.6, 3.0))

    # --- daily measures -------------------------------------------------------------
    dd = np.arange(D)
    adh = np.clip(exercise / 150.0, 0, 1.25)
    grav_protect = 1 - 0.6 * g                     # assumption: partial gravity partly protects
    monthly = 0.015 * (1 - 0.45 * adh) * grav_protect
    if story == "sleep_debt":
        monthly *= 1.15
    bmd_true = 100 - 100 * np.cumsum(monthly / 30.0)
    daily = {}
    daily["bmd"] = bmd_true + rng.normal(0, 0.32, D)
    musc_loss = np.cumsum(0.035 * (1 - 0.75 * np.clip(adh, 0, 1)) * grav_protect)
    daily["muscle"] = 100 - musc_loss + rng.normal(0, 0.9, D)
    daily["vo2"] = (100 - 11 * (1 - np.exp(-dd / 18.0)) + 5.5 * np.mean(adh) * (1 - np.exp(-dd / 70.0))
                    + rng.normal(0, 1.1, D))
    daily["plasma"] = 100 - 12.5 * (1 - np.exp(-dd / 3.0)) * (1 - 0.7 * g) + rng.normal(0, 1.0, D)
    daily["mass"] = meta["mass0"] * (1 - 0.00018 * dd) + rng.normal(0, 0.25, D)
    onsd = meta["onsd0"] + meta["onsd_rate"] * dd * (1 + dd / 400.0) * (1 - 0.5 * g)
    daily["onsd"] = onsd + rng.normal(0, 0.06, D)
    debt = np.maximum(0, 7.0 - sleep_h)
    debt_roll = np.convolve(debt, np.ones(3) / 3, mode="full")[:D]
    daily["sleep_h"] = sleep_h
    daily["cognition"] = 100 + rng.normal(0, 2.6, D) - 2.4 * debt_roll
    daily["mood"] = np.clip(80 - 0.035 * dd + rng.normal(0, 4.5, D) - 3.0 * debt_roll, 20, 100)
    daily["exercise"] = exercise
    daily["glucose"] = 86 + 0.012 * dd + rng.normal(0, 4.5, D) + (meta["mass0"] - 65) * 0.15
    daily["pvt"] = 248 + rng.normal(0, 11, D) + 14.0 * debt_roll + (meta["age"] - 40) * 0.8

    # radiation: chronic + two solar particle events at fixed mission days
    rate = m["dose_msv_day"]
    dose_day = rate * (1 + rng.normal(0, 0.06, D))
    sep_scale = {"mars_transit": 1.0, "artemis": 0.8, "mars_surface": 0.3, "iss": 0.05}[mission_id]
    for d_ago, mag in ((87, 11.5), (19, 24.0)):
        dd_ = D - 1 - d_ago
        if 0 <= dd_ < D:
            dose_day[dd_] += mag * sep_scale
    daily["dose"] = np.cumsum(dose_day)
    if story == "infection":
        daily["cognition"][-1] -= 3.5
        daily["mood"][-1] -= 6
        daily["glucose"][-1] += 11
    if scenario == "co2":
        daily["cognition"][-1] -= 5.5
        daily["mood"][-1] -= 7
        daily["pvt"][-1] += 28
    if scenario == "solar":
        daily["dose"][-1] += 9.0 * sep_scale

    for k in hourly:
        hourly[k] = hourly[k].astype(float)
    return AstronautData(meta=dict(meta), t0=t0, hours=H, hourly=hourly, daily=daily,
                         asleep=asleep, sleep_windows=windows)


def generate_crew(mission_id: str, now: datetime | None = None, scenario: str = "baseline") -> dict[str, AstronautData]:
    return {c["id"]: generate_astronaut(c, mission_id, now, scenario) for c in CREW}


def generate_env(mission_id: str, now: datetime | None = None, scenario: str = "baseline") -> dict:
    """Shared cabin environment, hourly, aligned with the crew streams."""
    m = MISSIONS[mission_id]
    t0, H, _ = mission_clock(mission_id, now)
    rng = _rng(mission_id, "cabin", "v2")
    i = np.arange(H)
    hod = i % 24
    active = ((hod >= 7) & (hod <= 22)).astype(float)
    exercise_bump = (((hod >= 10) & (hod < 11)) | ((hod >= 15) & (hod < 16))).astype(float)
    co2 = 2.05 + 0.28 * active + 0.25 * exercise_bump + _ar1(rng, H, 0.92, 0.18)
    temp = 22.4 + 0.5 * active + _ar1(rng, H, 0.9, 0.3)
    hum = 44 + 4 * active + _ar1(rng, H, 0.9, 3.0)
    pres = 101.3 + _ar1(rng, H, 0.95, 0.15)
    base_rate = m["dose_msv_day"] * 1000 / 24.0             # µSv/h
    rad = base_rate * (1 + _ar1(rng, H, 0.8, 0.06))
    D = H // 24 + 1
    sep_scale = {"mars_transit": 1.0, "artemis": 0.8, "mars_surface": 0.3, "iss": 0.05}[mission_id]
    for d_ago, mag in ((87, 11.5), (19, 24.0)):
        d = D - 1 - d_ago
        if d >= 0:
            start = d * 24 + 6
            prof = np.exp(-np.arange(18) / 5.0)
            prof = prof / prof.sum() * mag * 1000 * sep_scale
            rad[start:start + 18] += prof[: max(0, min(18, H - start))]
    if scenario == "co2":
        ramp = np.clip((i - (H - 1 - 6)) / 6.0, 0, 1)
        co2 = co2 + 3.6 * ramp
    if scenario == "solar":
        k = H - 3
        prof = np.array([1.0, 2.2, 3.1]) * 1000 * sep_scale
        rad[k:] += prof[: H - k]
    return {"co2": co2, "rad_rate": rad, "cabin_temp": temp, "humidity": hum, "pressure": pres, "hours": H, "t0": t0}


def ensure_signals(a: AstronautData):
    missing = [s for s in HOURLY_SIGNALS if s not in a.hourly] + [s for s in DAILY_SIGNALS if s not in a.daily]
    return missing
