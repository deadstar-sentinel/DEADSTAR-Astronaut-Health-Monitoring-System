# Methods

## Vitals forecasting (1 h – 7 d)
For each astronaut and signal (HR, HRV, SpO₂, respiration, core temperature, BP), fit on the last 14 days:
`y(t) = P[hour of day] + a + b·(t − now) + r(t)`. The 24-hour profile captures the astronaut's own routine (sleep, exercise blocks). The residual is forecast as a slow persistent component (EWMA, half-life ≈ 3 days), a fast AR(1) component and a damped short-term trend (only when significant).

**Uncertainty — split conformal.** Rolling-origin backtests (origin every 6 h over 14 days, horizons 1–168 h). Interval half-widths are empirical quantiles of |error| per horizon. Coverage is reported on the later 40 % of origins, which are held out from calibration.

**Skill** = 1 − MAE(model) / MAE(seasonal naive: same hour on the last observed day).

## Slow systems (3 d – mission end)
Conjugate Bayesian linear regression on the recent window. The slope prior is the NASA population rate (e.g. hip BMD −1.5 %/month unmitigated, scaled for exercise and gravity); the astronaut's measurements are the likelihood; random-walk process noise widens bands with horizon. Backtests at 3, 7, 14 and 30 days; longer horizons are labelled *prior-dominated*.

## Early warning
Robust z-scores against the astronaut's hour-of-day profile (last 14 days excluding the last 48 h), adjusted for sleep state from actigraphy so a shifted bedtime is not read as illness; 6-hour smoothing. An infection-like pattern requires temperature z > 1.8, HR z > 1.2 and HRV z < −1.0 for ≥ 3 consecutive hours.

## Ship vs. body
If cabin ppCO₂ exceeds NASA's 3 mmHg 1-hour limit and most of the crew show simultaneous rises in breathing and heart rate, the cause is attributed to the ship. An individual pattern with nominal cabin air is attributed to the body. Both can be true at once.

## Readiness
Two-process model of sleep regulation (Borbély 1982; Daan et al. 1984): homeostatic pressure rises with τ = 18.2 h awake and falls with τ = 4.2 h asleep; a 24 h circadian process peaks at 16:48. Alertness at the task is compared with a well-rested 23:00–07:00 schedule.

## Autonomy
SENTINEL acts onboard when Earth's answer — round-trip light time + 30 minutes of ground assessment — would arrive after the alert's action deadline, or during solar-conjunction blackout (Sun–Earth–Mars angle < 3°).

## Data
Crew data is synthetic and calibrated to NASA-published rates; the storylines (latent-virus reactivation, SANS progression, sleep restriction) play out in the latest hours so the console is always live. Uploaded CSVs replace the synthetic streams.
