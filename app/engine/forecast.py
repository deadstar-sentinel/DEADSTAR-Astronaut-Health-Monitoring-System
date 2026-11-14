"""
Multi-horizon forecasting with calibrated uncertainty.

Hourly vitals (1 h .. 7 d ahead)
    y(t) = circadian harmonics (24/12/8 h) + linear trend      fitted on the last 21 days
         + residual forecast: damped AR(1) level + damped trend on the residual
    Intervals: split-conformal. We run rolling-origin backtests (origin every 6 h)
    and take empirical quantiles of |error| per horizon. Coverage is reported on a
    held-out later block of origins, so the number on screen is honest.

Daily / slow variables (3 d .. 90 d, mission end)
    Bayesian linear trend: NASA population rate as the prior on the slope, the
    astronaut's own measurements as the likelihood, plus random-walk process
    noise so uncertainty grows with horizon. Backtested where history allows;
    otherwise flagged "prior-dominated".
"""
from __future__ import annotations

import math

import numpy as np

FIT_DAYS = 21
HARMONICS = 3
Z80, Z95 = 1.2816, 1.96


# ----------------------------------------------------------------------------- helpers
def _design(tt: np.ndarray, t_ref: float) -> np.ndarray:
    hod = np.mod(tt, 24.0)
    cols = [np.ones_like(tt)]
    for k in range(1, HARMONICS + 1):
        w = 2 * np.pi * k * hod / 24.0
        cols += [np.cos(w), np.sin(w)]
    cols.append((tt - t_ref) / (24.0 * FIT_DAYS))
    return np.column_stack(cols)


def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


class HourlyModel:
    """Seasonal-profile model fitted on y[end - fit_days*24 : end].

    y(t) = P[hour-of-day] + a + b (t - end) + r(t)
    The 24-hour profile captures the astronaut's own routine (sleep, exercise blocks),
    the linear term captures slow drift, and the residual is forecast as a slow
    persistent component (half-life ~3 days), a fast AR(1) component and a damped
    short-term trend. Hour-of-day = index % 24.
    """

    def __init__(self, y: np.ndarray, end: int | None = None, fit_days: int = 14):
        end = len(y) if end is None else end
        start = max(0, end - fit_days * 24)
        self.end = end
        tt = np.arange(start, end)
        yy = y[start:end]
        hod = tt % 24
        prof = np.array([np.mean(yy[hod == h]) if np.any(hod == h) else np.mean(yy) for h in range(24)])
        r = yy - prof[hod]
        x = (tt - end).astype(float)
        xm = x.mean()
        b = float(np.dot(x - xm, r - r.mean()) / (np.dot(x - xm, x - xm) or 1))
        a = float(r.mean() - b * xm)
        prof = np.array([np.mean((yy - (a + b * x))[hod == h]) if np.any(hod == h) else 0.0 for h in range(24)])
        self.prof, self.a, self.b = prof, a, b
        res = yy - prof[hod] - (a + b * x)
        self.sigma = float(np.std(res)) or 1e-6
        # slow component: EWMA of residuals (span ~12 h)
        alpha = 2 / (12 + 1)
        ew = 0.0
        for v in res:
            ew = alpha * v + (1 - alpha) * ew
        self.slow = ew
        fast = res - pd_ewma(res, alpha)
        f0, f1 = fast[:-1], fast[1:]
        self.phi = float(np.clip(np.dot(f0, f1) / (np.dot(f0, f0) or 1e-9), 0.0, 0.95))
        self.fast = float(fast[-1])
        recent = res[-24:]
        xr = np.arange(len(recent), dtype=float)
        xr -= xr.mean()
        sm = pd_ewma(recent, 2 / (6 + 1))
        slope = float(np.dot(xr, sm - sm.mean()) / (np.dot(xr, xr) or 1))
        resid2 = sm - sm.mean() - slope * xr
        se = float(np.std(resid2) / (math.sqrt(np.dot(xr, xr)) or 1))
        self.slope = slope if abs(slope) > 3.0 * se and abs(slope) * 24 > 0.5 * self.sigma else 0.0
        self.rho = 0.99    # slow-component persistence per hour
        self.psi = 0.97    # trend damping per hour

    def predict(self, horizon: int) -> np.ndarray:
        h = np.arange(1, horizon + 1, dtype=float)
        tt = self.end - 1 + h
        base = self.prof[(tt.astype(int)) % 24] + self.a + self.b * (tt - self.end)
        resid = self.slow * self.rho ** h + self.fast * self.phi ** h
        trend = self.slope * self.psi * (1 - self.psi ** h) / (1 - self.psi)
        return base + resid + trend


def pd_ewma(v: np.ndarray, alpha: float) -> np.ndarray:
    out = np.empty(len(v))
    ew = 0.0
    for i, x in enumerate(v):
        ew = alpha * x + (1 - alpha) * ew
        out[i] = ew
    return out


def backtest_hourly(y: np.ndarray, max_h: int = 168, step: int = 6, span_days: int = 14):
    """Rolling-origin backtest. Returns dict with per-horizon error arrays."""
    n = len(y)
    first = max(14 * 24, n - max_h - span_days * 24)
    origins = list(range(first, n - max_h + 1, step))
    if len(origins) < 6:
        return None
    errs = np.empty((len(origins), max_h))
    naive = np.empty((len(origins), max_h))
    for j, o in enumerate(origins):
        m = HourlyModel(y, end=o)
        f = m.predict(max_h)
        truth = y[o:o + max_h]
        errs[j] = truth - f
        # seasonal naive: same hour on the last observed day
        idx = o - 24 + (np.arange(max_h) % 24)
        naive[j] = truth - y[idx]
    return {"origins": origins, "errors": errs, "naive": naive}


def conformal_from_backtest(bt, max_h: int):
    E = np.abs(bt["errors"])
    k = len(E)
    split = max(3, int(k * 0.6))
    cal, ev = E[:split], E[split:]

    def q(arr, p):
        return np.maximum.accumulate(np.quantile(arr, p, axis=0))

    q80_cal, q95_cal = q(cal, 0.8), q(cal, 0.95)
    cov80 = float(np.mean(ev <= q80_cal)) if len(ev) else None
    cov95 = float(np.mean(ev <= q95_cal)) if len(ev) else None
    q80, q95 = q(E, 0.8), q(E, 0.95)
    mae = np.mean(E, axis=0)
    mae_naive = np.mean(np.abs(bt["naive"]), axis=0)
    return {"q80": q80, "q95": q95, "mae": mae, "mae_naive": mae_naive,
            "coverage80": cov80, "coverage95": cov95, "n_origins": k, "n_eval": int(len(ev))}


def horizon_summary(cal, hours: list[int]):
    out = []
    for h in hours:
        i = min(h, len(cal["mae"])) - 1
        mae = float(np.mean(cal["mae"][: i + 1]))
        naive = float(np.mean(cal["mae_naive"][: i + 1]))
        out.append({
            "h": h, "mae": mae, "mae_naive": naive,
            "skill": (1 - mae / naive) if naive > 0 else None,
            "q80": float(cal["q80"][i]), "q95": float(cal["q95"][i]),
        })
    return out


def exceed_prob(mu, q80, thr, direction):
    sigma = max(q80 / Z80, 1e-6)
    z = (thr - mu) / sigma
    p_above = 1 - norm_cdf(z)
    return p_above if direction == "above" else 1 - p_above


# ----------------------------------------------------------------------------- daily
def bayes_trend(y: np.ndarray, prior_slope: float, prior_sd: float, window: int = 60,
                end: int | None = None, process_q: float | None = None):
    """Conjugate Bayesian linear regression on the last `window` points ending at `end`."""
    end = len(y) if end is None else end
    start = max(0, end - window)
    yy = y[start:end]
    n = len(yy)
    x = np.arange(n, dtype=float) - (n - 1)       # 0 at the last observation
    X = np.column_stack([np.ones(n), x])
    # noise from first differences (robust to trend)
    d = np.diff(yy)
    sigma = float(1.4826 * np.median(np.abs(d - np.median(d))) / math.sqrt(2)) if n > 3 else 1.0
    sigma = max(sigma, 1e-4)
    prior_mean = np.array([float(np.mean(yy[-5:])), prior_slope])
    prior_cov = np.diag([max(np.var(yy), sigma ** 2) * 100 + 1e-6, prior_sd ** 2])
    P0 = np.linalg.inv(prior_cov)
    Pn = P0 + X.T @ X / sigma ** 2
    cov = np.linalg.inv(Pn)
    mean = cov @ (P0 @ prior_mean + X.T @ yy / sigma ** 2)
    if process_q is None:
        process_q = (0.15 * sigma) ** 2
    return {"mean": mean, "cov": cov, "sigma": sigma, "q": process_q, "n": n,
            "prior_slope": prior_slope, "prior_sd": prior_sd}


def bayes_predict(fit, horizon_days: int):
    h = np.arange(1, horizon_days + 1, dtype=float)
    X = np.column_stack([np.ones_like(h), h])
    mu = X @ fit["mean"]
    var = fit["sigma"] ** 2 + np.einsum("ij,jk,ik->i", X, fit["cov"], X) + fit["q"] * h
    sd = np.sqrt(var)
    return mu, sd


def backtest_daily(y, prior_slope, prior_sd, window, horizons=(3, 7, 14, 30), min_hist=30, step=3, q=None):
    out = {}
    n = len(y)
    for H in horizons:
        origins = list(range(min_hist, n - H + 1, step))
        if len(origins) < 5:
            out[H] = None
            continue
        errs, covs80, covs95 = [], [], []
        naive = []
        for o in origins:
            fit = bayes_trend(y, prior_slope, prior_sd, window=window, end=o, process_q=q)
            mu, sd = bayes_predict(fit, H)
            e = y[o + H - 1] - mu[-1]
            errs.append(abs(e))
            covs80.append(abs(e) <= Z80 * sd[-1])
            covs95.append(abs(e) <= Z95 * sd[-1])
            naive.append(abs(y[o + H - 1] - y[o - 1]))
        mae = float(np.mean(errs))
        mn = float(np.mean(naive))
        out[H] = {"mae": mae, "mae_naive": mn, "skill": (1 - mae / mn) if mn > 0 else None,
                  "coverage80": float(np.mean(covs80)), "coverage95": float(np.mean(covs95)),
                  "n": len(origins)}
    return out
