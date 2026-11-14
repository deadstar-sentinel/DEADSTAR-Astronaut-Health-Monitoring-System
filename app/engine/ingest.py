"""
Bring-your-own-data ingestion.

Accepts a CSV with a timestamp column, an astronaut column (id or name) and any
of SENTINEL's signals under common aliases. Hourly signals are resampled to
hourly means, daily signals to daily means. The series are time-aligned so the
newest sample is "now" on the mission clock, then forecasts recompute on them.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime

import numpy as np

from .constants import HOURLY_SIGNALS, DAILY_SIGNALS, SIGNALS
from .crew import CREW, AstronautData, generate_astronaut

ALIASES = {
    "hr": ["hr", "heart_rate", "heartrate", "pulse", "bpm"],
    "hrv": ["hrv", "rmssd", "hrv_rmssd"],
    "spo2": ["spo2", "sp02", "oxygen", "oxygen_saturation", "o2sat"],
    "rr": ["rr", "resp", "respiratory_rate", "breathing_rate"],
    "temp": ["temp", "temperature", "core_temp", "body_temp", "body_temperature"],
    "sbp": ["sbp", "systolic", "systolic_bp", "bp_sys"],
    "dbp": ["dbp", "diastolic", "diastolic_bp", "bp_dia"],
    "sleep_h": ["sleep_h", "sleep", "sleep_hours", "sleep_duration"],
    "cognition": ["cognition", "cognitive", "cognition_score"],
    "mood": ["mood", "mood_score", "stress"],
    "mass": ["mass", "weight", "body_mass"],
    "bmd": ["bmd", "bone_density", "hip_bmd"],
    "muscle": ["muscle", "strength", "leg_strength"],
    "vo2": ["vo2", "vo2max"],
    "onsd": ["onsd", "optic_nerve_sheath"],
    "plasma": ["plasma", "plasma_volume"],
    "dose": ["dose", "radiation", "cumulative_dose"],
    "exercise": ["exercise", "exercise_min"],
    "glucose": ["glucose", "blood_sugar", "blood_glucose", "bg"],
    "pvt": ["pvt", "reaction_time", "rt"],
}
TIME_KEYS = ["timestamp", "time", "datetime", "date", "t"]
WHO_KEYS = ["astronaut", "crew", "crew_id", "id", "name", "subject"]


def _parse_time(v: str):
    v = v.strip()
    try:
        x = float(v)
        return datetime.utcfromtimestamp(x / 1000 if x > 1e11 else x)
    except ValueError:
        pass
    for fmt in (None, "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%m/%d/%Y %H:%M"):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).replace(tzinfo=None) if fmt is None \
                else datetime.strptime(v, fmt)
        except ValueError:
            continue
    raise ValueError(f"unrecognised time '{v}'")


def parse_csv(text: str, mission_id: str):
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise ValueError("CSV has no rows")
    cols = {c.lower().strip(): c for c in rows[0].keys()}
    tkey = next((cols[k] for k in TIME_KEYS if k in cols), None)
    if not tkey:
        raise ValueError("No timestamp column (expected one of: " + ", ".join(TIME_KEYS) + ")")
    wkey = next((cols[k] for k in WHO_KEYS if k in cols), None)
    mapping = {}
    for sig, al in ALIASES.items():
        for a in al:
            if a in cols:
                mapping[sig] = cols[a]
                break
    if not mapping:
        raise ValueError("No recognised signal columns")
    groups: dict[str, list] = {}
    for r in rows:
        who = (r.get(wkey) or "uploaded").strip().lower() if wkey else "uploaded"
        groups.setdefault(who, []).append(r)

    result, report = {}, []
    crew_ids = {c["id"]: c for c in CREW}
    by_name = {c["name"].lower(): c for c in CREW} | {c["name"].split()[-1].lower(): c for c in CREW} | \
        {c["short"].lower(): c for c in CREW}
    for who, rs in groups.items():
        meta = crew_ids.get(who) or by_name.get(who)
        target = meta["id"] if meta else None
        if target is None:
            free = [c for c in CREW if c["id"] not in result]
            if not free:
                continue
            target = free[-1]["id"]
        base = generate_astronaut(crew_ids[target], mission_id)
        times = [_parse_time(r[tkey]) for r in rs]
        t_end = max(times)
        used = []
        for sig, col in mapping.items():
            vals = []
            for t, r in zip(times, rs):
                try:
                    vals.append((t, float(r[col])))
                except (TypeError, ValueError):
                    continue
            if len(vals) < 3:
                continue
            if sig in HOURLY_SIGNALS:
                n = base.hours
                buckets: dict[int, list] = {}
                for t, v in vals:
                    k = n - 1 - int((t_end - t).total_seconds() // 3600)
                    if 0 <= k < n:
                        buckets.setdefault(k, []).append(v)
                if len(buckets) < 72:
                    continue
                arr = base.hourly[sig].copy()
                ks = sorted(buckets)
                filled = np.interp(np.arange(ks[0], n), ks, [np.mean(buckets[k]) for k in ks])
                arr[ks[0]:] = filled
                base.hourly[sig] = arr
                used.append(sig)
            elif sig in base.daily:
                n = base.days
                buckets = {}
                for t, v in vals:
                    k = n - 1 - (t_end.date() - t.date()).days
                    if 0 <= k < n:
                        buckets.setdefault(k, []).append(v)
                if len(buckets) < 3:
                    continue
                arr = base.daily[sig].copy()
                ks = sorted(buckets)
                arr[ks[0]:] = np.interp(np.arange(ks[0], n), ks, [np.mean(buckets[k]) for k in ks])
                base.daily[sig] = arr
                used.append(sig)
        if used:
            base.source = "uploaded"
            result[target] = base
            report.append({"group": who, "mapped_to": target, "signals": used, "rows": len(rs),
                           "span_hours": round((t_end - min(times)).total_seconds() / 3600, 1)})
    if not result:
        raise ValueError("Nothing usable: need ≥72 hourly samples or ≥3 daily samples per signal")
    return result, {"columns": mapping, "groups": report}


def template_csv(st, cid: str = "haddad", hours: int = 96) -> str:
    a = st.crew[cid]
    out = io.StringIO()
    w = csv.writer(out)
    sigs = HOURLY_SIGNALS
    w.writerow(["timestamp", "astronaut"] + sigs)
    from datetime import timedelta
    for k in range(a.hours - hours, a.hours):
        t = a.t0 + timedelta(hours=k)
        w.writerow([t.strftime("%Y-%m-%dT%H:%M:%SZ"), cid] +
                   [round(float(a.hourly[s][k]), SIGNALS[s]["decimals"] + 1) for s in sigs])
    return out.getvalue()
