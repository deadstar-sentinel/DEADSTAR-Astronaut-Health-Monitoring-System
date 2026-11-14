"""Ship vs. body isolator, built like a differential amplifier.

Each astronaut's signal is a z-score against their own baseline. The part all
crew share (common mode) points at the ship; the part unique to one astronaut
(differential mode) points at their body. Common-mode rejection, the same idea
an ECE engineer uses to pull a heartbeat out of mains hum.
"""
import numpy as np


def isolate(z: np.ndarray, crew: list[str], env: np.ndarray | None = None,
            act: float = 2.0) -> dict:
    """z: crew x time matrix of baseline z-scores (latest sample last).
    env: optional habitat series (e.g. cabin CO2), same length as time."""
    z = np.asarray(z, dtype=float)
    common = z.mean(axis=0)
    diff = z - common
    now_common, now_diff = common[-1], diff[:, -1]
    env_r = None
    if env is not None and np.std(env) > 0 and np.std(common) > 0:
        env_r = float(np.corrcoef(common, env)[0, 1])

    if abs(now_common) >= act and (env_r is None or env_r >= 0.6):
        verdict = {"kind": "SHIP", "detail": "Whole crew drifting together"
                   + (f"; tracks habitat (r = {env_r:.2f})" if env_r is not None else "")}
    elif np.max(np.abs(now_diff)) >= act and abs(now_common) < act / 2:
        i = int(np.argmax(np.abs(now_diff)))
        verdict = {"kind": "BODY", "who": crew[i],
                   "detail": f"{crew[i]} alone is off baseline (z = {now_diff[i]:+.1f})"}
    else:
        verdict = {"kind": "NOMINAL", "detail": "Crew within personal baselines"}
    return {"verdict": verdict, "common_z": float(now_common),
            "differential_z": dict(zip(crew, map(float, now_diff))), "env_r": env_r}
