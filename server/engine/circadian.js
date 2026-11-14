import { TAU_RISE_H, TAU_DECAY_H, C_AMPLITUDE, C_ACROPHASE_H } from "./constants.js";

const STEP_H = 0.25;

function simulate(asleepFn, tStart, tEnd, s0 = 0.35) {
  const ts = [];
  const S = [];
  const C = [];
  let s = s0;
  for (let t = tStart; t <= tEnd + 1e-9; t += STEP_H) {
    if (asleepFn(t)) {
      s = s * Math.exp(-STEP_H / TAU_DECAY_H);
    } else {
      s = 1 - (1 - s) * Math.exp(-STEP_H / TAU_RISE_H);
    }
    ts.push(t);
    S.push(s);
    const modH = ((t % 24) + 24) % 24;
    C.push(C_AMPLITUDE * Math.cos((2 * Math.PI * (modH - C_ACROPHASE_H)) / 24));
  }
  return { ts, S, C };
}

export function readiness(a, taskHourAhead, plannedOnsetClock = null, plannedDuration = null, horizonH = 36) {
  const now = a.hours - 1 + 0.5;
  const windows = [...a.sleep_windows];
  let onsetClock = plannedOnsetClock !== null ? plannedOnsetClock : (a.meta.onset0 ?? 23.0);
  if (a.meta.story === "sleep_debt" && plannedOnsetClock === null) {
    onsetClock = 25.0;
  }
  const dur =
    plannedDuration !== null
      ? plannedDuration
      : a.meta.story === "sleep_debt"
        ? 4.8
        : (a.meta.sleep0 ?? 6.5);

  const dayNow = Math.floor(now / 24);
  let start = dayNow * 24 + onsetClock;
  if (start < now) start += 24;
  const future = [[start, start + dur]];
  const allW = [...windows, ...future];

  const asleep = (t) => {
    for (let i = 0; i < allW.length; i++) {
      if (t >= allW[i][0] && t < allW[i][1]) return true;
    }
    return false;
  };

  const t0 = now - 72;
  const { ts, S, C } = simulate(asleep, t0, now + horizonH);
  const { S: Sr, C: Cr } = simulate(
    (t) => {
      const h = ((t % 24) + 24) % 24;
      return h >= 23 || h < 7;
    },
    t0,
    now + horizonH
  );

  const lo = -0.85;
  const hi = 0.15;
  const score = ts.map((_, i) => Math.max(0, Math.min(100, ((C[i] - S[i] - lo) / (hi - lo)) * 100)));
  const ref = ts.map((_, i) => Math.max(0, Math.min(100, ((Cr[i] - Sr[i] - lo) / (hi - lo)) * 100)));

  const taskT = now + taskHourAhead;
  let k = 0;
  let bestD = Infinity;
  for (let i = 0; i < ts.length; i++) {
    const d = Math.abs(ts[i] - taskT);
    if (d < bestD) {
      bestD = d;
      k = i;
    }
  }
  const rel = (score[k] / Math.max(ref[k], 1)) * 100;

  const tOut = [];
  const alertOut = [];
  const refOut = [];
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] >= now - 48) {
      tOut.push(Math.round((ts[i] - now) * 100) / 100);
      alertOut.push(Math.round(score[i] * 10) / 10);
      refOut.push(Math.round(ref[i] * 10) / 10);
    }
  }

  const last3 = windows.slice(-3);
  let debt = 0;
  for (const [s, e] of last3) {
    debt += Math.max(0.0, 7.0 - (e - s));
  }

  return {
    t: tOut,
    alertness: alertOut,
    reference: refOut,
    sleep: allW
      .filter(([, e]) => e > now - 48)
      .map(([s, e]) => [Math.round((s - now) * 100) / 100, Math.round((e - now) * 100) / 100]),
    task_in_h: Math.round(taskHourAhead * 100) / 100,
    task_alertness: Math.round(score[k] * 10) / 10,
    task_reference: Math.round(ref[k] * 10) / 10,
    task_relative: Math.round(rel * 10) / 10,
    sleep_debt_3n: Math.round(debt * 10) / 10,
    planned_sleep: { onset_clock: ((onsetClock % 24) + 24) % 24, duration: dur },
  };
}
