"""
Live space weather from NASA CCMC DONKI (solar energetic particles, flares, CMEs),
with NOAA SWPC GOES proton flux as a second live source.

Sources are tried in order and cached for 20 minutes. If every live source fails
(venue Wi-Fi, API outage) SENTINEL falls back to a small set of real historical
DONKI SEP events and says so on screen ("cached").
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone

_CACHE = {"t": 0.0, "data": None}
_LOCK = threading.Lock()
TTL = 1200

FALLBACK_SEP = [
    {"id": "2025-02-25T00:42:00-SEP-001", "time": "2025-02-25T00:42Z", "instrument": "SOHO/EPHIN (model)",
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/37525/2"},
    {"id": "2024-09-17T07:35:00-SEP-001", "time": "2024-09-17T07:35Z", "instrument": "GOES-P: SEISS >10 MeV",
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/33467/2"},
    {"id": "2024-01-29T05:11:00-SEP-001", "time": "2024-01-29T05:11Z", "instrument": "STEREO A: IMPACT 13-100 MeV",
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/28836/2"},
    {"id": "2023-03-14T11:55:00-SEP-001", "time": "2023-03-14T11:55Z", "instrument": "GOES-P: SEISS >10 MeV",
     "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/24233/2"},
]


def _get(url: str, timeout: float = 6.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "DEADSTAR-SENTINEL/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _donki(kind: str, start: str, end: str):
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    urls = [
        f"https://api.nasa.gov/DONKI/{kind}?startDate={start}&endDate={end}&api_key={key}",
        f"https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/{kind}?startDate={start}&endDate={end}",
    ]
    last = None
    for u in urls:
        try:
            data = _get(u)
            if isinstance(data, list):
                return data, u.split("?")[0]
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(str(last))


def _goes_protons():
    data = _get("https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json")
    ten = [d for d in data if d.get("energy") == ">=10 MeV"]
    if not ten:
        return None
    last = ten[-1]
    flux = float(last.get("flux") or 0)
    s = 0
    for lvl, thr in ((1, 10), (2, 100), (3, 1e3), (4, 1e4), (5, 1e5)):
        if flux >= thr:
            s = lvl
    return {"flux_pfu": flux, "time": last.get("time_tag"), "s_scale": s,
            "series": [[d.get("time_tag"), float(d.get("flux") or 0)] for d in ten[-96:]]}


def fetch(force: bool = False) -> dict:
    with _LOCK:
        if not force and _CACHE["data"] and time.time() - _CACHE["t"] < TTL:
            return _CACHE["data"]
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")
    out = {"fetched": now.isoformat(), "live": False, "sources": [], "sep": [], "flares": [], "cme": [],
           "goes": None, "errors": []}
    try:
        sep, src = _donki("SEP", start, end)
        out["sep"] = [{"id": e.get("sepID"), "time": e.get("eventTime"),
                       "instrument": ", ".join(i.get("displayName", "") for i in e.get("instruments", [])),
                       "link": e.get("link")} for e in sep][::-1]
        out["sources"].append(src)
        out["live"] = True
    except Exception as e:  # noqa: BLE001
        out["errors"].append(f"DONKI SEP: {e}")
    try:
        flr, src = _donki("FLR", start, end)
        out["flares"] = [{"id": e.get("flrID"), "class": e.get("classType"), "peak": e.get("peakTime"),
                          "link": e.get("link")} for e in flr][::-1][:25]
        out["live"] = True
    except Exception as e:  # noqa: BLE001
        out["errors"].append(f"DONKI FLR: {e}")
    try:
        cme, src = _donki("CME", start, end)
        out["cme"] = [{"id": e.get("activityID"), "time": e.get("startTime"), "note": (e.get("note") or "")[:160],
                       "link": e.get("link")} for e in cme][::-1][:15]
    except Exception as e:  # noqa: BLE001
        out["errors"].append(f"DONKI CME: {e}")
    try:
        out["goes"] = _goes_protons()
        if out["goes"]:
            out["sources"].append("NOAA SWPC GOES integral protons")
            out["live"] = True
    except Exception as e:  # noqa: BLE001
        out["errors"].append(f"GOES: {e}")
    if not out["sep"] and not out["live"]:
        out["sep"] = FALLBACK_SEP
        out["cached"] = True
    out["summary"] = summarize(out)
    with _LOCK:
        _CACHE.update(t=time.time(), data=out)
    return out


def summarize(sw: dict) -> dict:
    now = datetime.now(timezone.utc)
    level, reasons = 0, []

    def parse(ts):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            return None

    for e in sw.get("sep", []):
        t = parse(e.get("time") or "")
        if t and now - t < timedelta(hours=72) and not sw.get("cached"):
            level = max(level, 2)
            reasons.append(f"Solar energetic particle event {e.get('time')}")
    for f in sw.get("flares", []):
        t = parse(f.get("peak") or "")
        cls = (f.get("class") or "")
        if t and now - t < timedelta(hours=48) and cls.startswith("X"):
            level = max(level, 1)
            reasons.append(f"{cls} flare at {f.get('peak')}")
    g = sw.get("goes")
    if g and g.get("s_scale", 0) >= 1:
        level = max(level, 2 if g["s_scale"] >= 2 else 1)
        reasons.append(f"GOES ≥10 MeV protons {g['flux_pfu']:.1f} pfu (S{g['s_scale']})")
    label = ["QUIET", "ELEVATED", "STORM"][level]
    return {"level": level, "label": label, "reasons": reasons[:4]}
