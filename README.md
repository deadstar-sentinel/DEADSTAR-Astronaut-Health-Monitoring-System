# DEADSTAR SENTINEL

**An autonomous flight surgeon that flies with the crew.**
NASA Space Apps Challenge 2026 · Kuwait · *Create Health Monitoring Software for Astronauts on Space Missions*

> On Mars, the doctor is up to 22 light-minutes away. SENTINEL is not.

SENTINEL keeps a digital twin of every astronaut, forecasts their health with calibrated uncertainty, explains every alert in NASA's 17-risk language, and tells the crew when Earth's answer cannot arrive in time.

## What is in this skeleton

| Path | Status | What it is |
| --- | --- | --- |
| `app/engine/constants.py` | working | Every constant with its source and a `verified` flag |
| `app/engine/lightdelay.py` | working, tested | Live Earth–Mars light time from JPL elements + the light-cone rule |
| `app/engine/ledger.py` | working, tested | Hash-chained forecast ledger (forecasts are pre-registered) |
| `app/engine/isolator.py` | working, tested | Ship vs. body: common-mode rejection across the crew |
| `app/engine/synth.py` | spec + stub | Synthetic crew simulator, separate from the forecaster |
| `app/engine/forecast.py` | spec + stub | Multi-horizon forecasts with conformal bands |
| `app/engine/backtest.py` | spec + stub | Scorecard and reliability diagram, from the ledger only |
| `app/engine/decide.py` | spec + stub | Early warning, 17 HRP risks, EVA GO/NO-GO poll, what-if, inventory, DONKI |
| `app/main.py` | working | FastAPI service: `/health`, `/api/lightdelay`, `/api/constants`, `/api/ledger/verify` |
| `app/static/index.html` | shell | Console shell: MET clock, live light delay, Methods table |
| `data/inventory.json` | sample | Synthetic medical kit (placeholders) |

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload        # http://localhost:8000
pytest -q
```

**Railway:** connect this repo; the `Procfile` starts the service. Variables: `SENTINEL_ROLE=earth`, `NASA_API_KEY=<your api.nasa.gov key>`.
**On stage:** run a second copy on the laptop with `SENTINEL_ROLE=ship`, then turn Wi-Fi off. The ship keeps working; the Earth link shows LOS.

## Honesty rules (Validity is judged)

- Synthetic crew calibrated to NASA-published rates. Names are fictional. Never presented as real astronaut data.
- Decision support, never diagnosis. SENTINEL starts the onboard protocol and alerts the crew; the crew medical officer confirms.
- Accuracy numbers come only from the ledger-based backtest, labelled "pipeline validation on a synthetic crew" until real data is uploaded.
- Every constant shows its source; unverified ones are flagged on screen until a teammate checks them.

## NASA sources

NASA HRP Risks · NASA HRP Ongoing Research · HRP Evidence Report: Bone · Curiosity MSL/RAD (Zeitlin et al. 2013) · NASA Twins Study (2019) · Inspiration4 data on OSDR · NASA DONKI · JPL Approximate Positions of the Planets.

Team: KCST, Kuwait. Built with AI assistance (Claude); disclosed on the submission page.
