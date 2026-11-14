"""
Two-process model of sleep regulation (Borbély 1982; Daan, Beersma & Borbély 1984).

Process S (homeostatic sleep pressure) rises exponentially toward 1 while awake
(tau 18.2 h) and decays toward 0 during sleep (tau 4.2 h). Process C is a 24 h
circadian rhythm. Predicted alertness = C − S. We simulate each astronaut's real
sleep history for the last 72 h, then the planned schedule, and compare with a
well-rested reference schedule to express readiness as a percentage.
"""
from __future__ import annotations

import numpy as np

from .constants import TAU_RISE_H, TAU_DECAY_H, C_AMPLITUDE, C_ACROPHASE_H

STEP_H = 0.25


def _simulate(asleep_fn, t_start, t_end, s0=0.35):
    ts = np.arange(t_start, t_end + 1e-9, STEP_H)
    S = np.empty(len(ts))
    s = s0
    for k, t in enumerate(ts):
        if asleep_fn(t):
            s = s * np.exp(-STEP_H / TAU_DECAY_H)
        else:
            s = 1 - (1 - s) * np.exp(-STEP_H / TAU_RISE_H)
        S[k] = s
    C = C_AMPLITUDE * np.cos(2 * np.pi * ((ts % 24) - C_ACROPHASE_H) / 24)
    return ts, S, C


def readiness(a, task_hour_ahead: float, planned_onset_clock: float | None = None,
              planned_duration: float | None = None, horizon_h: int = 36):
    """Return alertness curves (history 48 h + forecast) and readiness at a task time."""
    now = a.now_index + 0.5
    windows = list(a.sleep_windows)
    # planned sleep tonight
    onset_clock = planned_onset_clock if planned_onset_clock is not None else a.meta.get("onset0", 23.0)
    if a.meta.get("story") == "sleep_debt" and planned_onset_clock is None:
        onset_clock = 25.0
    dur = planned_duration if planned_duration is not None else (
        4.8 if a.meta.get("story") == "sleep_debt" else a.meta.get("sleep0", 6.5))
    day_now = int(now // 24)
    start = day_now * 24 + onset_clock
    if start < now:
        start += 24
    future = [(start, start + dur)]
    all_w = windows + future

    def asleep(t):
        for s, e in all_w:
            if s <= t < e:
                return True
        return False

    t0 = now - 72
    ts, S, C = _simulate(asleep, t0, now + horizon_h)

    # well-rested reference: 8 h sleep 23:00-07:00 every night
    def ref_asleep(t):
        h = t % 24
        return h >= 23 or h < 7
    _, Sr, Cr = _simulate(ref_asleep, t0, now + horizon_h)

    A = C - S
    Ar = Cr - Sr
    # map to 0..100 using the reference daytime range
    lo, hi = -0.85, 0.15
    score = np.clip((A - lo) / (hi - lo) * 100, 0, 100)
    ref = np.clip((Ar - lo) / (hi - lo) * 100, 0, 100)
    task_t = now + task_hour_ahead
    k = int(np.argmin(np.abs(ts - task_t)))
    rel = float(score[k] / max(ref[k], 1) * 100)
    hist = ts >= now - 48
    debt = float(sum(max(0.0, 7.0 - (e - s)) for s, e in windows[-3:]))
    return {
        "t": (ts[hist] - now).round(2).tolist(),
        "alertness": score[hist].round(1).tolist(),
        "reference": ref[hist].round(1).tolist(),
        "sleep": [[round(s - now, 2), round(e - now, 2)] for s, e in all_w if e > now - 48],
        "task_in_h": round(task_hour_ahead, 2),
        "task_alertness": round(float(score[k]), 1),
        "task_reference": round(float(ref[k]), 1),
        "task_relative": round(rel, 1),
        "sleep_debt_3n": round(debt, 1),
        "planned_sleep": {"onset_clock": onset_clock % 24, "duration": dur},
    }
