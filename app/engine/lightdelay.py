"""Live Earth-Mars light time from JPL approximate Keplerian elements,
and the light-cone rule that decides when SENTINEL must act on board.
"""
import math
from datetime import datetime, timezone

from .constants import AU_KM, C_KM_S, ELEMENTS


def julian_date(t: datetime) -> float:
    t = t.astimezone(timezone.utc)
    return t.timestamp() / 86400.0 + 2440587.5


def heliocentric_xyz(body: str, t: datetime):
    """Ecliptic J2000 heliocentric position (au), JPL approximate method."""
    base, rate = ELEMENTS[body].value
    T = (julian_date(t) - 2451545.0) / 36525.0
    a, e, inc, L, varpi, node = (b + r * T for b, r in zip(base, rate))
    omega = varpi - node
    M = (L - varpi + 180.0) % 360.0 - 180.0
    Mr, er = math.radians(M), e
    E = Mr + er * math.sin(Mr)
    for _ in range(30):
        dE = (E - er * math.sin(E) - Mr) / (1 - er * math.cos(E))
        E -= dE
        if abs(dE) < 1e-12:
            break
    xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
    w, O, i = map(math.radians, (omega, node, inc))
    cw, sw, cO, sO, ci, si = math.cos(w), math.sin(w), math.cos(O), math.sin(O), math.cos(i), math.sin(i)
    x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp
    y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp
    z = (sw * si) * xp + (cw * si) * yp
    return x, y, z


def earth_mars_distance_au(t: datetime) -> float:
    e, m = heliocentric_xyz("earth", t), heliocentric_xyz("mars", t)
    return math.dist(e, m)


def earth_mars_one_way_s(t: datetime) -> float:
    return earth_mars_distance_au(t) * AU_KM.value / C_KM_S.value


def must_act_onboard(time_to_threshold_s: float, one_way_s: float,
                     surgeon_response_s: float = 600.0) -> dict:
    """Light-cone rule: if Earth's reply cannot arrive before the forecast
    crosses its clinical threshold, the crew acts on SENTINEL's protocol now
    (the crew medical officer confirms). Earth is informed either way."""
    earth_reply_s = 2 * one_way_s + surgeon_response_s
    return {
        "earth_reply_s": earth_reply_s,
        "time_to_threshold_s": time_to_threshold_s,
        "act_onboard": time_to_threshold_s < earth_reply_s,
        "margin_s": time_to_threshold_s - earth_reply_s,
    }
