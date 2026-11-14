"""Synthetic crew simulator, deliberately SEPARATE from the forecaster.

Fix #1 in the Design Bible: if the forecaster is tested on data built from its
own assumptions, the scorecard only proves the code runs. This simulator adds
what the forecaster does not model: regime shifts, sensor dropouts, outliers,
missing hours and one scripted event per astronaut (Mori: latent-virus
reactivation; Novak: SANS drift; Vasquez: bone loss).

Crew names are fictional. Rates come from constants.py.

TODO(engine): implement
    simulate_crew(days=60, seed=7) -> dict[name, DataFrame-like]
      hourly: hr, hrv, spo2, resp, core_temp, sbp, dbp
      daily: sleep_h, pvt_ms, mood_1to5, body_mass, hip_bmd_pct, onsd_mm,
             plasma_vol, dose_msv, exercise_min
    with seeds fixed so the demo replays identically.
"""

CREW = [
    {"id": "MORI", "role": "Flight Engineer", "event": "latent_virus_reactivation"},
    {"id": "NOVAK", "role": "Commander", "event": "sans_drift"},
    {"id": "VASQUEZ", "role": "Mission Specialist", "event": "bone_loss"},
    {"id": "OKAFOR", "role": "Pilot", "event": None},
]


def simulate_crew(days: int = 60, seed: int = 7):
    raise NotImplementedError("engine workstream: see module docstring")
