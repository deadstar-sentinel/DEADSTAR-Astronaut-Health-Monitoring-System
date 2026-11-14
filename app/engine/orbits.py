"""
Earth–Mars geometry from JPL's approximate Keplerian elements
(Standish, "Approximate Positions of the Planets", valid 1800–2050 AD).
Gives today's real Earth–Mars distance, one-way light time and the Sun–Earth–Mars
angle (communication blackout near solar conjunction).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .constants import AU_KM, SPEED_OF_LIGHT_KM_S

# a, e, I, L, long.peri, long.node  +  rates per Julian century
ELEMENTS = {
    "earth": ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
              (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    "mars": ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
             (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
}


def _helio(planet: str, when: datetime):
    jd = when.timestamp() / 86400.0 + 2440587.5
    T = (jd - 2451545.0) / 36525.0
    el0, rate = ELEMENTS[planet]
    a, e, I, L, wbar, Om = (el0[k] + rate[k] * T for k in range(6))
    w = wbar - Om
    M = (L - wbar + 180) % 360 - 180
    Mr = math.radians(M)
    E = Mr + e * math.sin(Mr)
    for _ in range(12):
        E -= (E - e * math.sin(E) - Mr) / (1 - e * math.cos(E))
    xp = a * (math.cos(E) - e)
    yp = a * math.sqrt(1 - e * e) * math.sin(E)
    w, Om, I = math.radians(w), math.radians(Om), math.radians(I)
    x = (math.cos(w) * math.cos(Om) - math.sin(w) * math.sin(Om) * math.cos(I)) * xp + \
        (-math.sin(w) * math.cos(Om) - math.cos(w) * math.sin(Om) * math.cos(I)) * yp
    y = (math.cos(w) * math.sin(Om) + math.sin(w) * math.cos(Om) * math.cos(I)) * xp + \
        (-math.sin(w) * math.sin(Om) + math.cos(w) * math.cos(Om) * math.cos(I)) * yp
    z = (math.sin(w) * math.sin(I)) * xp + (math.cos(w) * math.sin(I)) * yp
    return x, y, z


def earth_mars(when: datetime | None = None) -> dict:
    when = when or datetime.now(timezone.utc)
    ex, ey, ez = _helio("earth", when)
    mx, my, mz = _helio("mars", when)
    dx, dy, dz = mx - ex, my - ey, mz - ez
    d_au = math.sqrt(dx * dx + dy * dy + dz * dz)
    # Sun-Earth-Mars elongation: angle at Earth between the Sun and Mars
    se = (-ex, -ey, -ez)
    dot = se[0] * dx + se[1] * dy + se[2] * dz
    elong = math.degrees(math.acos(dot / (math.sqrt(ex * ex + ey * ey + ez * ez) * d_au)))
    owlt = d_au * AU_KM / SPEED_OF_LIGHT_KM_S
    return {"distance_au": d_au, "distance_km": d_au * AU_KM, "owlt_s": owlt,
            "elongation_deg": elong, "conjunction_blackout": elong < 3.0,
            "earth_xy": [ex, ey], "mars_xy": [mx, my]}


def light_time(mission: dict, when: datetime | None = None) -> dict:
    kind = mission["light_time"]
    if kind == "leo":
        return {"owlt_s": 0.12, "method": "LEO via relay satellites (sub-second)", "blackout": False}
    if kind == "moon":
        return {"owlt_s": 1.28, "method": "Earth–Moon mean distance", "blackout": False}
    em = earth_mars(when)
    if mission["id"] == "mars_transit":
        f = mission["current_day"] / mission["duration_days"]
        owlt = em["owlt_s"] * f
        method = f"Today's Earth–Mars distance (JPL elements) × transit fraction {f:.2f}"
    else:
        owlt = em["owlt_s"]
        method = "Today's Earth–Mars distance from JPL Keplerian elements"
    return {"owlt_s": owlt, "method": method, "blackout": em["conjunction_blackout"],
            "earth_mars_owlt_s": em["owlt_s"], "distance_au": em["distance_au"],
            "elongation_deg": em["elongation_deg"]}
