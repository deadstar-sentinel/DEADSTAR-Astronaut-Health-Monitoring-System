"""Multi-horizon forecasts with calibrated bands (feature canon rank 1-2).

Horizon      Model                                                Confidence earned by
1-24 h       circadian harmonic regression (24 h + 12 h) +       split-conformal intervals from
             damped trend + AR residual, last 21 days             rolling-origin backtests (14 days)
3 d, 7 d     Bayesian local trend with physiology prior           rolling backtests: MAE, coverage
30 d, 90 d   Bayesian linear trend, NASA evidence as prior        backtest where history allows,
                                                                  else labelled PRIOR-DOMINATED
Mission end  mechanistic projection under chosen countermeasures  posterior predictive band

Every forecast returns: path, 80 % and 95 % bands, P(crossing a threshold),
and is written to the ledger BEFORE its outcome exists.

TODO(engine): implement forecast(series, horizon, threshold=None) -> dict
"""


def forecast(series, horizon: str, threshold: float | None = None) -> dict:
    raise NotImplementedError("engine workstream: see module docstring")
