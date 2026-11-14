"""DEADSTAR SENTINEL — API and static host."""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .engine import analysis, content, copilot, ingest, orbits, spaceweather, whatif
from .engine.constants import (DEFAULT_MISSION, ENV_SIGNALS, HRP_RISKS, MISSIONS, SCENARIOS, SIGNALS,
                               SOURCES, HOURLY_SIGNALS, FORECAST_DAILY)

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

app = FastAPI(title="DEADSTAR SENTINEL", version="1.0")
app.add_middleware(GZipMiddleware, minimum_size=1200)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/models", StaticFiles(directory=ROOT / "public" / "models"), name="models")  # Blender twin

LOCK = threading.Lock()
SERVER = {
    "mission": os.environ.get("DEFAULT_MISSION", DEFAULT_MISSION),
    "scenario": "baseline",
    "overrides": {},      # mission -> {(crew, signal): value}
    "uploaded": {},       # mission -> {crew: AstronautData}
    "version": 0,
    "pvt": [],
    "log": [],
    "started": time.time(),
}

HORIZONS = {"24h": ("h", 24), "48h": ("h", 48), "72h": ("h", 72), "7d": ("h", 168),
            "30d": ("d", 30), "90d": ("d", 90), "end": ("d", None)}


def state(mission: str | None = None, scenario: str | None = None):
    m = mission or SERVER["mission"]
    sc = scenario or SERVER["scenario"]
    if m not in MISSIONS:
        raise HTTPException(404, f"unknown mission {m}")
    if sc not in SCENARIOS:
        raise HTTPException(404, f"unknown scenario {sc}")
    return analysis.get_state(m, sc, SERVER["overrides"].get(m), SERVER["uploaded"].get(m), SERVER["version"])


def _crew(st, cid):
    if cid not in st.crew:
        raise HTTPException(404, f"unknown crew member {cid}")
    return st.analyses[cid]


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating,)):
        v = float(o)
        return None if (np.isnan(v) or np.isinf(v)) else v
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, float) and (np.isnan(o) or np.isinf(o)):
        return None
    return o


def J(o):
    return JSONResponse(clean(o))


# ----------------------------------------------------------------------------- pages
@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/crew")
@app.get("/astronaut")
def astronaut_page():
    return FileResponse(STATIC / "astronaut.html")


@app.get("/holo")
def holo_page():
    return FileResponse(STATIC / "holo.html")


@app.get("/twin")
def twin_page():
    """Blender hologram twin (same page AI Studio previews from the repo root)."""
    return FileResponse(ROOT / "index.html")


@app.get("/health")
@app.get("/api/health")
def health():
    return {"ok": True, "uptime_s": round(time.time() - SERVER["started"]), "mission": SERVER["mission"],
            "scenario": SERVER["scenario"]}


# ----------------------------------------------------------------------------- reference
@app.get("/api/meta")
def meta():
    return J({
        "missions": list(MISSIONS.values()), "scenarios": SCENARIOS, "signals": SIGNALS, "env_signals": ENV_SIGNALS,
        "risks": HRP_RISKS, "sources": SOURCES, "indicators": content.INDICATORS, "protocols": content.PROTOCOLS,
        "exams": content.GUIDED_EXAMS, "regions": content.REGIONS, "horizons": list(HORIZONS),
        "active": {"mission": SERVER["mission"], "scenario": SERVER["scenario"]},
        "model_glb": (STATIC / "models" / "astronaut.glb").exists(),
    })


@app.post("/api/control")
async def control(req: Request):
    body = await req.json()
    with LOCK:
        if body.get("mission") in MISSIONS:
            SERVER["mission"] = body["mission"]
        if body.get("scenario") in SCENARIOS:
            SERVER["scenario"] = body["scenario"]
    return {"mission": SERVER["mission"], "scenario": SERVER["scenario"]}


# ----------------------------------------------------------------------------- state
@app.get("/api/state")
def get_state(mission: str | None = None, scenario: str | None = None):
    st = state(mission, scenario)
    sw = spaceweather.fetch()
    return J({
        "mission": st.mission, "scenario": st.scenario, "scenario_info": SCENARIOS[st.scenario],
        "met": st.met(), "now": st.now.isoformat(),
        "light": st.light, "ship_vs_body": st.svb,
        "crew": [st.crew_summary(c) for c in st.crew],
        "alerts": st.alerts, "env": st.env_summary(),
        "risk_matrix": {c: {k: round(v["score"], 1) for k, v in st.risks[c].items()} for c in st.crew},
        "space_weather": {"summary": sw.get("summary"), "live": sw.get("live"), "cached": sw.get("cached", False),
                          "latest_sep": (sw.get("sep") or [None])[0], "goes": (sw.get("goes") or {}).get("flux_pfu")},
        "compute_s": st.compute_s,
        "pvt_guests": SERVER["pvt"][-12:],
    })


@app.get("/api/crew/{cid}")
def crew_detail(cid: str, mission: str | None = None, scenario: str | None = None):
    st = state(mission, scenario)
    an = _crew(st, cid)
    a = an.a
    H = a.hours
    zser = {k: np.round(v[-72:], 2).tolist() for k, v in an.z.items()}
    return J({
        "summary": st.crew_summary(cid),
        "risks": {k: {**v, "band": analysis.band(v["score"])} for k, v in st.risks[cid].items()},
        "organs": st.organ_map(cid),
        "task": an.task,
        "anomaly": {"z": zser, "score": np.round(an.anom_score[-72:], 2).tolist(),
                    "detected_hours_ago": an.detect_hours_ago, "infection_pattern": an.infection_now},
        "hourly_72": {s: np.round(a.hourly[s][-72:], 3).tolist() for s in HOURLY_SIGNALS},
        "daily_30": {s: np.round(a.daily[s][-30:], 3).tolist() for s in a.daily},
        "daily_all": {s: np.round(a.daily[s], 3).tolist() for s in ("bmd", "onsd", "muscle", "vo2", "plasma", "mass", "dose")},
        "asleep_72": np.round(a.asleep[-72:], 2).tolist(),
        "mission_day": st.mission["current_day"], "duration": st.mission["duration_days"],
        "alerts": [x for x in st.alerts if x["crew"] in (cid, None)],
        "attribution": st.svb["per_crew"].get(cid),
    })


@app.get("/api/forecast/{cid}/{signal}")
def forecast(cid: str, signal: str, horizon: str = "24h", mission: str | None = None, scenario: str | None = None):
    st = state(mission, scenario)
    an = _crew(st, cid)
    if signal not in SIGNALS:
        raise HTTPException(404, "unknown signal")
    if horizon not in HORIZONS:
        raise HTTPException(400, "unknown horizon")
    kind, h = HORIZONS[horizon]
    if h is None:
        h = an.days_left
    if kind == "h" and signal in HOURLY_SIGNALS:
        out = an.hourly_forecast(signal, h)
    else:
        if signal not in FORECAST_DAILY and signal not in HOURLY_SIGNALS:
            raise HTTPException(400, "signal has no forecast")
        days = h if kind == "d" else max(2, h // 24)
        out = an.daily_forecast(signal, days)
    out["meta"] = SIGNALS[signal]
    out["horizon_key"] = horizon
    return J(out)


@app.get("/api/whatif/{cid}")
def whatif_get(cid: str, mission: str | None = None, scenario: str | None = None):
    st = state(mission, scenario)
    return J(whatif.simulate(_crew(st, cid), {}))


@app.post("/api/whatif/{cid}")
async def whatif_post(cid: str, req: Request, mission: str | None = None, scenario: str | None = None):
    st = state(mission, scenario)
    body = await req.json()
    return J(whatif.simulate(_crew(st, cid), body or {}))


@app.get("/api/spaceweather")
def space_weather(force: bool = False):
    return J(spaceweather.fetch(force))


@app.get("/api/earthlink")
def earthlink(mission: str | None = None):
    st = state(mission)
    em = orbits.earth_mars()
    return J({"light": st.light, "geometry": em, "mission": st.mission["id"],
              "transit_fraction": st.mission["current_day"] / st.mission["duration_days"],
              "ground_response_min": analysis.GROUND_RESPONSE_MIN})


@app.post("/api/ask")
async def ask(req: Request):
    body = await req.json()
    q = (body.get("q") or "").strip()
    if not q:
        raise HTTPException(400, "empty question")
    st = state(body.get("mission"), body.get("scenario"))
    return J(copilot.answer(q[:500], st, body.get("crew")))


@app.get("/api/briefing")
def get_briefing(mission: str | None = None, scenario: str | None = None):
    return J(copilot.briefing(state(mission, scenario)))


@app.post("/api/log")
async def log_measurement(req: Request):
    body = await req.json()
    cid, sig = body.get("crew"), body.get("signal")
    try:
        val = float(body.get("value"))
    except (TypeError, ValueError):
        raise HTTPException(400, "value must be a number")
    if sig not in SIGNALS or SIGNALS[sig]["kind"] != "daily":
        raise HTTPException(400, "only daily measures can be logged here")
    m = body.get("mission") or SERVER["mission"]
    with LOCK:
        SERVER["overrides"].setdefault(m, {})[(cid, sig)] = val
        SERVER["version"] += 1
        SERVER["log"].append({"t": datetime.now(timezone.utc).isoformat(), "crew": cid, "signal": sig, "value": val})
    return {"ok": True, "version": SERVER["version"]}


@app.post("/api/pvt")
async def pvt(req: Request):
    body = await req.json()
    trials = [float(x) for x in body.get("trials", []) if 100 <= float(x) <= 2000]
    if not trials:
        raise HTTPException(400, "no valid trials")
    med = float(np.median(trials))
    entry = {"t": datetime.now(timezone.utc).isoformat(), "name": (body.get("name") or "Guest")[:24],
             "crew": body.get("crew"), "median_ms": round(med), "trials": [round(x) for x in trials]}
    with LOCK:
        SERVER["pvt"].append(entry)
        if body.get("crew"):
            m = body.get("mission") or SERVER["mission"]
            SERVER["overrides"].setdefault(m, {})[(body["crew"], "pvt")] = med
            SERVER["version"] += 1
    return entry


@app.get("/api/pvt")
def pvt_list():
    return {"results": SERVER["pvt"][-50:]}


@app.post("/api/ingest")
async def ingest_csv(file: UploadFile = File(...), mission: str | None = None):
    raw = (await file.read()).decode("utf-8", errors="replace")
    m = mission or SERVER["mission"]
    try:
        data, report = ingest.parse_csv(raw, m)
    except ValueError as e:
        raise HTTPException(400, str(e))
    with LOCK:
        SERVER["uploaded"].setdefault(m, {}).update(data)
        SERVER["version"] += 1
    return J({"ok": True, "report": report})


@app.delete("/api/ingest")
def ingest_reset():
    with LOCK:
        SERVER["uploaded"].clear()
        SERVER["overrides"].clear()
        SERVER["version"] += 1
    return {"ok": True}


@app.get("/api/template.csv")
def template(mission: str | None = None):
    st = state(mission)
    return PlainTextResponse(ingest.template_csv(st), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=sentinel_template.csv"})


@app.get("/api/validation")
def validation(mission: str | None = None, scenario: str | None = None):
    st = state(mission, scenario)
    rows = []
    for cid, an in st.analyses.items():
        for s in HOURLY_SIGNALS:
            cal = an.hcal[s]
            for h in analysis.fc.horizon_summary(cal, [1, 6, 24, 48, 72, 168]):
                rows.append({"crew": cid, "signal": s, "kind": "hourly", "h": h["h"], "unit": "h",
                             "mae": h["mae"], "mae_naive": h["mae_naive"], "skill": h["skill"],
                             "coverage80": cal["coverage80"], "coverage95": cal["coverage95"],
                             "n": cal["n_origins"]})
        for s in FORECAST_DAILY:
            for H, v in (an.dbt.get(s) or {}).items():
                if v:
                    rows.append({"crew": cid, "signal": s, "kind": "daily", "h": H, "unit": "d", "mae": v["mae"],
                                 "mae_naive": v["mae_naive"], "skill": v["skill"], "coverage80": v["coverage80"],
                                 "coverage95": v["coverage95"], "n": v["n"]})
    # aggregate
    agg = {}
    for r in rows:
        k = (r["kind"], r["h"])
        agg.setdefault(k, []).append(r)
    summary = []
    for (kind, h), rs in sorted(agg.items(), key=lambda kv: (kv[0][0] != "hourly", kv[0][1])):
        sk = [r["skill"] for r in rs if r["skill"] is not None]
        summary.append({"kind": kind, "h": h, "unit": "h" if kind == "hourly" else "d",
                        "skill_median": float(np.median(sk)) if sk else None,
                        "coverage80": float(np.mean([r["coverage80"] for r in rs if r["coverage80"] is not None])),
                        "coverage95": float(np.mean([r["coverage95"] for r in rs if r["coverage95"] is not None])),
                        "n_series": len(rs)})
    return J({"rows": rows, "summary": summary})


@app.on_event("startup")
def warm():
    def _w():
        try:
            state()
            spaceweather.fetch()
        except Exception as e:  # noqa: BLE001
            print("warmup failed", e)
    threading.Thread(target=_w, daemon=True).start()
