import { CAREER_DOSE_LIMIT_MSV } from "./constants.js";
import * as fc from "./forecast.js";

const SEP_PER_MONTH = 0.5;
const SEP_MEAN_MSV = 15.0;

export function defaults(an) {
  const d = an.a.daily;
  return {
    exercise_min: Math.round(fc.mean(d.exercise.slice(-14))),
    sleep_h: Math.round(fc.mean(d.sleep_h.slice(-7)) * 10) / 10,
    b_vitamin: false,
    thigh_cuff_h: 0.0,
    bisphosphonate: false,
    shelter: 0.6,
  };
}

export function simulate(an, params = {}) {
  const base = defaults(an);
  const p = { ...base };
  for (const [k, v] of Object.entries(params || {})) {
    if (k in base) p[k] = v;
  }
  const days = an.days_left;
  const t = Array.from({ length: days + 1 }, (_, i) => i);
  const adh = (ex) => Math.min(ex / 150.0, 1.25);
  const a0 = adh(base.exercise_min);
  const a1 = adh(p.exercise_min);

  const bFit = an.dfits.bmd;
  const bNow = bFit.mean[0];
  const bSlope = bFit.mean[1];
  const bSd = Math.sqrt(bFit.cov[1][1]);
  const fBone =
    ((1 - 0.45 * a1) / Math.max(1 - 0.45 * a0, 0.05)) * (p.bisphosphonate ? 0.4 : 1.0);
  const boneBase = t.map((ti) => bNow + bSlope * ti);
  const boneNew = t.map((ti) => bNow + bSlope * fBone * ti);
  const boneSd = t.map((ti) => Math.sqrt(bFit.sigma * bFit.sigma + Math.pow(bSd * ti, 2) + bFit.q * ti));

  const mFit = an.dfits.muscle;
  const mNow = mFit.mean[0];
  const mSlope = mFit.mean[1];
  const fM = (1 - 0.75 * Math.min(a1, 1)) / Math.max(1 - 0.75 * Math.min(a0, 1), 0.05);
  const muscBase = t.map((ti) => mNow + mSlope * ti);
  const muscNew = t.map((ti) => mNow + mSlope * fM * ti);

  const vNow = an.dfits.vo2.mean[0];
  const vo2New = t.map((ti) => vNow + (a1 - a0) * 4.0 * (1 - Math.exp(-ti / 30.0)));

  const oFit = an.dfits.onsd;
  const oNow = oFit.mean[0];
  const oSlope = oFit.mean[1];
  const oSdS = Math.sqrt(oFit.cov[1][1]);
  const fO = (p.b_vitamin ? 0.75 : 1.0) * (1 - Math.min(0.25, 0.025 * p.thigh_cuff_h));
  const onsdBase = t.map((ti) => oNow + oSlope * ti);
  const onsdNew = t.map((ti) => oNow + oSlope * fO * ti);
  const onsdSd = t.map((ti) => Math.sqrt(oFit.sigma * oFit.sigma + Math.pow(oSdS * ti, 2) + oFit.q * ti));

  const pOver = (mu, sd, thr) => 1 - fc.norm_cdf((thr - mu) / Math.max(sd, 1e-6));

  const rate = an.m.dose_msv_day;
  const doseNow = an.a.daily.dose[an.a.daily.dose.length - 1];
  const months = days / 30.0;
  const sepBase = SEP_PER_MONTH * months * SEP_MEAN_MSV * (1 - 0.7 * base.shelter);
  const sepNew = SEP_PER_MONTH * months * SEP_MEAN_MSV * (1 - 0.7 * p.shelter);
  const doseBaseEnd = doseNow + rate * days + sepBase;
  const doseNewEnd = doseNow + rate * days + sepNew;

  const alert = (sl) => Math.max(40, Math.min(100, 100 - 9 * Math.max(0, 7 - sl)));
  const pvt = (sl) => 248 + 14 * Math.max(0, 7 - sl);
  const round = (v, dec) => {
    const f = Math.pow(10, dec);
    return Math.round(v * f) / f;
  };
  const pack = (baseV, newV, unit, better = "higher", decimals = 1) => ({
    baseline: round(baseV, decimals),
    scenario: round(newV, decimals),
    delta: round(newV - baseV, decimals),
    unit,
    better,
  });

  const step = Math.max(1, Math.floor(t.length / 60));
  const sample = (arr, dec = null) => {
    const out = [];
    for (let i = 0; i < arr.length; i += step) {
      out.push(dec === null ? arr[i] : round(arr[i], dec));
    }
    return out;
  };

  return {
    params: p,
    defaults: base,
    days_left: days,
    end: {
      bmd: pack(boneBase[boneBase.length - 1], boneNew[boneNew.length - 1], "% baseline"),
      p_bone_10: pack(
        1 - pOver(boneBase[boneBase.length - 1], boneSd[boneSd.length - 1], 90.0),
        1 - pOver(boneNew[boneNew.length - 1], boneSd[boneSd.length - 1], 90.0),
        "probability",
        "lower",
        3
      ),
      muscle: pack(muscBase[muscBase.length - 1], muscNew[muscNew.length - 1], "% baseline"),
      vo2: pack(vNow, vo2New[vo2New.length - 1], "% baseline"),
      onsd: pack(onsdBase[onsdBase.length - 1], onsdNew[onsdNew.length - 1], "mm", "lower", 2),
      p_sans: pack(
        pOver(onsdBase[onsdBase.length - 1], onsdSd[onsdSd.length - 1], 6.0),
        pOver(onsdNew[onsdNew.length - 1], onsdSd[onsdSd.length - 1], 6.0),
        "probability",
        "lower",
        3
      ),
      dose: pack(doseBaseEnd, doseNewEnd, "mSv", "lower", 0),
      dose_pct: pack(
        (doseBaseEnd / CAREER_DOSE_LIMIT_MSV) * 100,
        (doseNewEnd / CAREER_DOSE_LIMIT_MSV) * 100,
        "% of limit",
        "lower",
        1
      ),
      alertness: pack(alert(base.sleep_h), alert(p.sleep_h), "% of rested"),
      pvt: pack(pvt(base.sleep_h), pvt(p.sleep_h), "ms", "lower", 0),
    },
    series: {
      t: sample(t),
      bmd_base: sample(boneBase, 3),
      bmd_new: sample(boneNew, 3),
      onsd_base: sample(onsdBase, 3),
      onsd_new: sample(onsdNew, 3),
    },
    assumptions: [
      "Exercise effect on bone and muscle scales the astronaut's own measured trend.",
      "Bisphosphonate effect from LeBlanc et al. 2013 (bisphosphonate + resistive exercise).",
      "B-vitamin and thigh-cuff effects are hypotheses under test in ongoing NASA studies.",
      `Solar particle events: ${SEP_PER_MONTH}/month, ${SEP_MEAN_MSV.toFixed(0)} mSv each if unsheltered.`,
    ],
  };
}
