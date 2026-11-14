# DEADSTAR SENTINEL

**On Mars, the doctor is up to 22 light-minutes away. SENTINEL is not.**

SENTINEL is an autonomous medical officer and predictive digital twin for astronauts on missions beyond real-time reach of Earth. It forecasts each crew member's health from 24 hours to mission end with calibrated confidence, explains every alert in the language of NASA's 17 Human Research Program risks, tells the crew whether a problem is the **ship or their body**, and acts onboard when Earth's answer would arrive too late.

Built for the NASA Space Apps Challenge 2026 — *Create Health Monitoring Software for Astronauts on Space Missions* — Kuwait local event, Team DEADSTAR.

## What it does

| | |
|---|---|
| **Multi-horizon forecasts** | 24 h · 48 h · 72 h · 7 d · 30 d · 90 d · mission end, each with 80 % and 95 % bands |
| **Measured accuracy** | Rolling-origin backtests for every astronaut and signal; skill vs. a naive forecast and interval coverage on held-out data, shown in the app |
| **Threshold probabilities** | "P(fever ≥ 38.0 °C in 24 h)", "P(≥ 10 % hip bone loss by mission end)", "P(optic nerve sheath ≥ 6 mm)" |
| **Early warning** | Circadian- and sleep-adjusted anomaly detection; an infection-like pattern is flagged hours before fever |
| **Ship vs. body** | Crew-wide deviations with cabin CO₂ above NASA's 3 mmHg 1-hour limit → the ship; one person's deviation with normal air → the body |
| **Light-delay autonomy** | Today's real Earth–Mars light time from JPL orbital elements; SENTINEL acts onboard when round trip + ground time exceeds the action deadline |
| **17 HRP risks** | Every score maps to NASA's own risk page |
| **What-if countermeasures** | Exercise, sleep, bisphosphonates, B-vitamins (NASA B-Complex), thigh cuffs (NASA Thigh Cuff), storm-shelter compliance |
| **Holographic body twin** | Three.js hologram, organs coloured by risk, heart beating at the live heart rate, mission-day morph (fluid shift, leg and bone loss); Pepper's-ghost mode for a tablet pyramid |
| **Astronaut self-view** | Phone view in plain language: health forecast, tap where it hurts, routine measurements (blood pressure, blood sugar, mood), reaction test, guided self-exam with voice |
| **Voice medical officer** | Ask by voice or text; answers grounded in the computed numbers (Claude if `ANTHROPIC_API_KEY` is set, a rules engine otherwise) |
| **Live NASA space weather** | DONKI solar energetic particles, flares, CMEs + NOAA GOES protons; cached real events if offline |
| **Bring your own data** | CSV upload with automatic column mapping; forecasts recompute on real data |

## Pages

- `/` — flight-surgeon console
- `/astronaut` — astronaut self-view (phone)
- `/holo` — Pepper's-ghost hologram (four views; put a clear pyramid on a tablet)

Keys on the console: **1** baseline · **2** CO₂ scrubber degradation · **3** solar particle event · **4** crew fatigue · **B** spoken briefing.

## Run locally (works offline)

```bash
pip install -r requirements.txt
uvicorn app.main:app --port 8000
# open http://localhost:8000
```

Fonts and 3D libraries are bundled; only live space weather needs the internet.

## Deploy

Railway auto-detects Python (`railway.json`, `Procfile`). Optional variables: `NASA_API_KEY` (defaults to `DEMO_KEY`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DEFAULT_MISSION` (`mars_transit` · `mars_surface` · `artemis` · `iss`).

## 3D models

- `static/models/z2.glb` — NASA Z2 exploration spacesuit, from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) (textures resized).
- `static/models/body.glb` — rigged human figure ("X Bot", Mixamo, via the three.js examples). To use a Blender model instead, export a Mixamo-rigged character over this file; the skeleton, organs and tap targets bind to its bones.

Views: Hologram · Realistic · X-ray, each in cabin or in the EVA suit, with suit-vs-cabin telemetry and a decompression-sickness check.

## Live pulse sensor (optional)

Any serial device that prints `{"hr":72,"spo2":98}` or `HR:72,SPO2:98` per line at 115200 baud (e.g. ESP32 + MAX30102) connects through **Live sensor** in Chrome/Edge.

## Honesty

Crew data is synthetic, calibrated to NASA-published rates; names are fictional. What-if effect sizes are literature-informed estimates; B-Complex and Thigh Cuff effects are hypotheses under test. SENTINEL is decision support, not a medical device.

See [`docs/METHODS.md`](docs/METHODS.md) and [`docs/DATASETS.md`](docs/DATASETS.md).
