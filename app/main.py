"""DEADSTAR SENTINEL web service (one Python service on Railway).

Run locally: uvicorn app.main:app --reload
The same app runs twice in the demo: on the laptop as the SHIP (works with
Wi-Fi off) and on Railway as EARTH. Set SENTINEL_ROLE=ship or earth.
"""
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .engine import constants
from .engine.ledger import Ledger
from .engine.lightdelay import earth_mars_distance_au, earth_mars_one_way_s

ROOT = Path(__file__).parent
ROLE = os.getenv("SENTINEL_ROLE", "earth")
ledger = Ledger(ROOT.parent / "data" / "ledger.jsonl")

app = FastAPI(title="DEADSTAR SENTINEL")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
app.mount("/models", StaticFiles(directory=ROOT.parent / "public" / "models"), name="models")


@app.get("/")
def index():
    """The hologram twin (the same file AI Studio / Vite serves)."""
    return FileResponse(ROOT.parent / "index.html")


@app.get("/console")
def console():
    return FileResponse(ROOT / "static" / "console.html")


@app.get("/health")
def health():
    return {"ok": True, "role": ROLE}


@app.get("/api/lightdelay")
def lightdelay(mission: str = "mars_transit"):
    m = constants.MISSIONS.get(mission, constants.MISSIONS["mars_transit"])
    now = datetime.now(timezone.utc)
    if m["delay"] == "live":
        one_way = earth_mars_one_way_s(now)
        dist = earth_mars_distance_au(now)
    else:
        one_way, dist = m["one_way_s"], None
    return {"mission": mission, "label": m["label"], "utc": now.isoformat(),
            "distance_au": dist, "one_way_s": one_way, "round_trip_s": 2 * one_way,
            "source": constants.JPL_URL}


@app.get("/api/constants")
def all_constants():
    return constants.all_constants()


@app.get("/api/ledger/verify")
def ledger_verify():
    return ledger.verify()
