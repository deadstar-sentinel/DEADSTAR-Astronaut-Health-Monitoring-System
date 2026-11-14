import { MISSIONS, HOURLY_SIGNALS, DAILY_SIGNALS } from "./constants.js";

export const CREW = [
  {
    id: "vasquez", name: "Elena Vasquez", role: "Commander", short: "CDR",
    age: 46, sex: "F", mass0: 62.0, hr0: 57.0, hrv0: 49.0, sbp0: 112.0, dbp0: 71.0,
    temp0: 36.42, rr0: 13.5, spo2_0: 97.9, sleep0: 6.3, onset0: 23.2,
    exercise0: 112.0, onsd0: 4.86, onsd_rate: 0.0006, story: "sleep_debt",
    bio: "Mission commander, test pilot. Third long-duration flight.",
  },
  {
    id: "mori", name: "Kenji Mori", role: "Flight Engineer", short: "FE",
    age: 39, sex: "M", mass0: 73.5, hr0: 60.0, hrv0: 57.0, sbp0: 118.0, dbp0: 76.0,
    temp0: 36.48, rr0: 14.0, spo2_0: 98.0, sleep0: 6.4, onset0: 22.6,
    exercise0: 152.0, onsd0: 4.95, onsd_rate: 0.0005, story: "infection",
    bio: "Systems engineer, life-support specialist. First long-duration flight.",
  },
  {
    id: "haddad", name: "Layla Haddad", role: "Medical Officer", short: "MO",
    age: 41, sex: "F", mass0: 57.8, hr0: 62.0, hrv0: 54.0, sbp0: 110.0, dbp0: 69.0,
    temp0: 36.45, rr0: 14.5, spo2_0: 98.1, sleep0: 6.7, onset0: 22.4,
    exercise0: 158.0, onsd0: 4.78, onsd_rate: 0.0003, story: "nominal",
    bio: "Emergency physician and crew medical officer.",
  },
  {
    id: "novak", name: "Tomas Novak", role: "Mission Specialist", short: "MS",
    age: 44, sex: "M", mass0: 81.2, hr0: 59.0, hrv0: 46.0, sbp0: 121.0, dbp0: 78.0,
    temp0: 36.40, rr0: 13.8, spo2_0: 97.7, sleep0: 6.2, onset0: 22.9,
    exercise0: 145.0, onsd0: 5.00, onsd_rate: 0.0037, story: "sans",
    bio: "Planetary geologist. Surface science lead.",
  },
];

export const CREW_BY_ID = Object.fromEntries(CREW.map((c) => [c.id, c]));

const INFECTION_ONSET_H = 27;
const INFECTION_RAMP_H = 48.0;
const SLEEP_DEBT_NIGHTS = 5;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    c = CRC_TABLE[(c ^ str.charCodeAt(i)) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

class SeededRng {
  constructor(...parts) {
    let s = crc32(parts.map(String).join(":"));
    this.a = (s || 1) >>> 0;
    this.b = (s ^ 0x9e3779b9) >>> 0;
    this.c = (s ^ 0x85ebca6b) >>> 0;
    this.d = (s ^ 0xc2b2ae35) >>> 0;
    this._spare = null;
  }
  random() {
    let a = this.a | 0, b = this.b | 0, c = this.c | 0, d = this.d | 0;
    const t = (((a + b) | 0) + d) | 0;
    this.d = (d + 1) | 0;
    this.a = b ^ (b >>> 9);
    this.b = (c + (c << 3)) | 0;
    this.c = ((c << 21) | (c >>> 11)) + t | 0;
    return (t >>> 0) / 4294967296;
  }
  normal1(loc = 0, scale = 1) {
    if (this._spare !== null) {
      const z = this._spare;
      this._spare = null;
      return loc + scale * z;
    }
    let u = 0, v = 0;
    while (u === 0) u = this.random();
    v = this.random();
    const r = Math.sqrt(-2.0 * Math.log(u));
    const th = 2.0 * Math.PI * v;
    this._spare = r * Math.sin(th);
    return loc + scale * r * Math.cos(th);
  }
  normal(loc = 0, scale = 1, size = 1) {
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = this.normal1(loc, scale);
    return out;
  }
}

function ar1(rng, n, phi, sigma) {
  const e = rng.normal(0, sigma * Math.sqrt(1 - phi * phi), n);
  const out = new Float64Array(n);
  let acc = rng.normal1(0, sigma);
  for (let i = 0; i < n; i++) {
    acc = phi * acc + e[i];
    out[i] = acc;
  }
  return out;
}

export function infection_severity(hours) {
  const out = new Float64Array(hours);
  const onset = hours - 1 - INFECTION_ONSET_H;
  for (let i = 0; i < hours; i++) {
    const x = Math.max(0, Math.min(1, (i - onset) / INFECTION_RAMP_H));
    out[i] = Math.pow(x, 1.3);
  }
  return out;
}

export function mission_clock(missionId, now = null) {
  const m = MISSIONS[missionId];
  const d = now ? new Date(now) : new Date();
  d.setUTCMinutes(0, 0, 0);
  const day = m.current_day;
  const midnight = new Date(d);
  midnight.setUTCHours(0, 0, 0, 0);
  const t0 = new Date(midnight.getTime() - day * 86400000);
  const hours = day * 24 + d.getUTCHours() + 1;
  return { t0, hours, now: d };
}

export function generate_astronaut(meta, missionId, now = null, scenario = "baseline") {
  const m = MISSIONS[missionId];
  const { t0, hours: H } = mission_clock(missionId, now);
  const D = Math.floor(H / 24) + 1;
  const rng = new SeededRng(missionId, meta.id, "v3");
  const story = meta.story;
  const g = m.gravity_g;

  const exercise = rng.normal(meta.exercise0, 14, D).map((v) => Math.max(40, Math.min(220, v)));
  const sleep_h = rng.normal(meta.sleep0, 0.55, D).map((v) => Math.max(4.0, Math.min(8.6, v)));
  const onset = rng.normal(meta.onset0, 0.35, D);

  if (story === "sleep_debt") {
    const sh = rng.normal(4.7, 0.25, SLEEP_DEBT_NIGHTS);
    const on = rng.normal(25.1, 0.3, SLEEP_DEBT_NIGHTS);
    for (let k = 0; k < SLEEP_DEBT_NIGHTS && D - SLEEP_DEBT_NIGHTS + k >= 0; k++) {
      const idx = D - SLEEP_DEBT_NIGHTS + k;
      sleep_h[idx] = Math.max(4.0, Math.min(5.3, sh[k]));
      onset[idx] = on[k];
    }
  }
  if (story === "infection") {
    for (let idx = Math.max(0, D - 2); idx < D; idx++) {
      sleep_h[idx] = Math.max(4.2, Math.min(8, sleep_h[idx] - 1.1));
    }
  }
  if (scenario === "fatigue") {
    const srng = new SeededRng(missionId, meta.id, "fatigue");
    const sh = srng.normal(4.6, 0.25, 4);
    const on = srng.normal(24.9, 0.3, 4);
    for (let k = 0; k < 4 && D - 4 + k >= 0; k++) {
      const idx = D - 4 + k;
      sleep_h[idx] = Math.min(sleep_h[idx], Math.max(4.0, Math.min(5.2, sh[k])));
      onset[idx] = Math.max(onset[idx], on[k]);
    }
  }

  const asleep = new Float64Array(H);
  const windows = [];
  for (let d = 1; d < D; d++) {
    const start = (d - 1) * 24 + onset[d];
    const end = start + sleep_h[d];
    windows.push([start, end]);
    const lo = Math.floor(start);
    const hi = Math.ceil(end);
    for (let k = Math.max(lo, 0); k < Math.min(hi, H); k++) {
      asleep[k] = Math.max(0.0, Math.min(k + 1, end) - Math.max(k, start));
    }
  }

  const exercising = new Float64Array(H);
  for (let k = 0; k < H; k++) {
    const d = Math.floor(k / 24);
    const half = exercise[Math.min(d, D - 1)] / 2 / 60.0;
    const h = k % 24;
    for (const s of [10, 15]) {
      if (h >= s && h < s + Math.ceil(half)) {
        exercising[k] = Math.min(1.0, half - (h - s));
      }
    }
  }

  const infect = story === "infection" ? infection_severity(H) : new Float64Array(H);
  const nHr = ar1(rng, H, 0.7, 2.2);
  const nHrv = ar1(rng, H, 0.6, 4.0);
  const nSpo2 = ar1(rng, H, 0.5, 0.35);
  const nRr = ar1(rng, H, 0.5, 0.55);
  const nTemp = ar1(rng, H, 0.85, 0.07);
  const nSbp = ar1(rng, H, 0.6, 4.0);
  const nDbp = ar1(rng, H, 0.6, 3.0);

  const hourly = {
    hr: new Float64Array(H),
    hrv: new Float64Array(H),
    spo2: new Float64Array(H),
    rr: new Float64Array(H),
    temp: new Float64Array(H),
    sbp: new Float64Array(H),
    dbp: new Float64Array(H),
  };

  for (let i = 0; i < H; i++) {
    const hod = i % 24;
    const day = Math.floor(i / 24);
    const circ = Math.cos((2 * Math.PI * (hod - 16.0)) / 24);
    const circT = Math.cos((2 * Math.PI * (hod - 18.0)) / 24);
    const adapt = 1 - Math.exp(-day / 14.0);
    const feverDrift = 0.55 * (1 - Math.exp(-day / 45.0));
    const co2Resp = scenario === "co2" ? Math.max(0, Math.min(1, (i - (H - 1 - 6)) / 6.0)) : 0;
    const sl = asleep[i];
    const ex = exercising[i];
    const inf = infect[i];

    hourly.hr[i] =
      4.5 * co2Resp +
      (meta.hr0 + 5.0 * circ - 7.0 * sl + 38.0 * ex + 2.5 * adapt * (1 - g) + 18.0 * inf + nHr[i]);
    hourly.hrv[i] = Math.max(
      8,
      meta.hrv0 * (1 + 0.28 * sl - 0.10 * circ - 0.45 * ex) * (1 - 0.5 * inf) + nHrv[i]
    );
    hourly.spo2[i] = Math.max(88, Math.min(100, meta.spo2_0 - 0.35 * sl - 0.9 * inf + nSpo2[i]));
    hourly.rr[i] =
      2.8 * co2Resp + (meta.rr0 + 0.8 * circ - 1.6 * sl + 7.0 * ex + 3.2 * inf + nRr[i]);
    hourly.temp[i] =
      meta.temp0 + 0.30 * circT - 0.20 * sl + 0.28 * ex + feverDrift + 1.15 * inf + nTemp[i];
    hourly.sbp[i] =
      meta.sbp0 - 4.0 * adapt * (1 - g) + 6.0 * circ - 10.0 * sl + 16.0 * ex + 4.0 * inf + nSbp[i];
    hourly.dbp[i] =
      meta.dbp0 - 2.5 * adapt * (1 - g) + 3.5 * circ - 7.0 * sl + 6.0 * ex + nDbp[i];
  }

  const daily = {
    bmd: new Float64Array(D),
    muscle: new Float64Array(D),
    vo2: new Float64Array(D),
    plasma: new Float64Array(D),
    mass: new Float64Array(D),
    onsd: new Float64Array(D),
    sleep_h: sleep_h,
    cognition: new Float64Array(D),
    mood: new Float64Array(D),
    exercise: exercise,
    glucose: new Float64Array(D),
    pvt: new Float64Array(D),
    dose: new Float64Array(D),
  };

  const adh = exercise.map((e) => Math.max(0, Math.min(1.25, e / 150.0)));
  let adhMean = 0;
  for (let d = 0; d < D; d++) adhMean += adh[d];
  adhMean /= D || 1;
  const gravProtect = 1 - 0.6 * g;

  const nBmd = rng.normal(0, 0.32, D);
  const nMusc = rng.normal(0, 0.9, D);
  const nVo2 = rng.normal(0, 1.1, D);
  const nPlasma = rng.normal(0, 1.0, D);
  const nMass = rng.normal(0, 0.25, D);
  const nOnsd = rng.normal(0, 0.06, D);
  const nCog = rng.normal(0, 2.6, D);
  const nMood = rng.normal(0, 4.5, D);
  const nGlu = rng.normal(0, 4.5, D);
  const nPvt = rng.normal(0, 11, D);
  const nDose = rng.normal(0, 0.06, D);

  let cumMonthly = 0;
  let cumMusc = 0;
  const debt = new Float64Array(D);
  for (let d = 0; d < D; d++) debt[d] = Math.max(0, 7.0 - sleep_h[d]);

  const rate = m.dose_msv_day;
  const sepScale = { mars_transit: 1.0, artemis: 0.8, mars_surface: 0.3, iss: 0.05 }[missionId];
  const doseDay = new Float64Array(D);
  for (let d = 0; d < D; d++) doseDay[d] = rate * (1 + nDose[d]);
  for (const [dAgo, mag] of [
    [87, 11.5],
    [19, 24.0],
  ]) {
    const dd_ = D - 1 - dAgo;
    if (dd_ >= 0 && dd_ < D) doseDay[dd_] += mag * sepScale;
  }

  let cumDose = 0;
  for (let d = 0; d < D; d++) {
    let monthly = 0.015 * (1 - 0.45 * adh[d]) * gravProtect;
    if (story === "sleep_debt") monthly *= 1.15;
    cumMonthly += monthly / 30.0;
    daily.bmd[d] = 100 - 100 * cumMonthly + nBmd[d];

    cumMusc += 0.035 * (1 - 0.75 * Math.min(adh[d], 1)) * gravProtect;
    daily.muscle[d] = 100 - cumMusc + nMusc[d];

    daily.vo2[d] =
      100 - 11 * (1 - Math.exp(-d / 18.0)) + 5.5 * adhMean * (1 - Math.exp(-d / 70.0)) + nVo2[d];
    daily.plasma[d] = 100 - 12.5 * (1 - Math.exp(-d / 3.0)) * (1 - 0.7 * g) + nPlasma[d];
    daily.mass[d] = meta.mass0 * (1 - 0.00018 * d) + nMass[d];
    const onsd = meta.onsd0 + meta.onsd_rate * d * (1 + d / 400.0) * (1 - 0.5 * g);
    daily.onsd[d] = onsd + nOnsd[d];

    const debtRoll =
      ((debt[d] || 0) + (d >= 1 ? debt[d - 1] : 0) + (d >= 2 ? debt[d - 2] : 0)) / 3;
    daily.cognition[d] = 100 + nCog[d] - 2.4 * debtRoll;
    daily.mood[d] = Math.max(20, Math.min(100, 80 - 0.035 * d + nMood[d] - 3.0 * debtRoll));
    daily.glucose[d] = 86 + 0.012 * d + nGlu[d] + (meta.mass0 - 65) * 0.15;
    daily.pvt[d] = 248 + nPvt[d] + 14.0 * debtRoll + (meta.age - 40) * 0.8;

    cumDose += doseDay[d];
    daily.dose[d] = cumDose;
  }

  if (story === "infection") {
    daily.cognition[D - 1] -= 3.5;
    daily.mood[D - 1] -= 6;
    daily.glucose[D - 1] += 11;
  }
  if (scenario === "co2") {
    daily.cognition[D - 1] -= 5.5;
    daily.mood[D - 1] -= 7;
    daily.pvt[D - 1] += 28;
  }
  if (scenario === "solar") {
    daily.dose[D - 1] += 9.0 * sepScale;
  }

  return {
    meta: { ...meta },
    t0,
    hours: H,
    days: D,
    now_index: H - 1,
    hourly,
    daily,
    asleep,
    sleep_windows: windows,
    source: "synthetic",
  };
}

export function generate_crew(missionId, now = null, scenario = "baseline") {
  const out = {};
  for (const c of CREW) out[c.id] = generate_astronaut(c, missionId, now, scenario);
  return out;
}

export function generate_env(missionId, now = null, scenario = "baseline") {
  const m = MISSIONS[missionId];
  const { t0, hours: H } = mission_clock(missionId, now);
  const rng = new SeededRng(missionId, "cabin", "v2");
  const nCo2 = ar1(rng, H, 0.92, 0.18);
  const nTemp = ar1(rng, H, 0.9, 0.3);
  const nHum = ar1(rng, H, 0.9, 3.0);
  const nPres = ar1(rng, H, 0.95, 0.15);
  const baseRate = (m.dose_msv_day * 1000) / 24.0;
  const nRad = ar1(rng, H, 0.8, 0.06);

  const co2 = new Float64Array(H);
  const cabin_temp = new Float64Array(H);
  const humidity = new Float64Array(H);
  const pressure = new Float64Array(H);
  const rad_rate = new Float64Array(H);

  for (let i = 0; i < H; i++) {
    const hod = i % 24;
    const active = hod >= 7 && hod <= 22 ? 1.0 : 0.0;
    const exerciseBump = (hod >= 10 && hod < 11) || (hod >= 15 && hod < 16) ? 1.0 : 0.0;
    co2[i] = 2.05 + 0.28 * active + 0.25 * exerciseBump + nCo2[i];
    cabin_temp[i] = 22.4 + 0.5 * active + nTemp[i];
    humidity[i] = 44 + 4 * active + nHum[i];
    pressure[i] = 101.3 + nPres[i];
    rad_rate[i] = baseRate * (1 + nRad[i]);
  }

  const D = Math.floor(H / 24) + 1;
  const sepScale = { mars_transit: 1.0, artemis: 0.8, mars_surface: 0.3, iss: 0.05 }[missionId];
  for (const [dAgo, mag] of [
    [87, 11.5],
    [19, 24.0],
  ]) {
    const d = D - 1 - dAgo;
    if (d >= 0) {
      const start = d * 24 + 6;
      const raw = [];
      let sum = 0;
      for (let k = 0; k < 18; k++) {
        const v = Math.exp(-k / 5.0);
        raw.push(v);
        sum += v;
      }
      for (let k = 0; k < 18 && start + k < H; k++) {
        rad_rate[start + k] += (raw[k] / sum) * mag * 1000 * sepScale;
      }
    }
  }

  if (scenario === "co2") {
    for (let i = 0; i < H; i++) {
      const ramp = Math.max(0, Math.min(1, (i - (H - 1 - 6)) / 6.0));
      co2[i] += 3.6 * ramp;
    }
  }
  if (scenario === "solar") {
    const k = H - 3;
    const prof = [1.0, 2.2, 3.1].map((v) => v * 1000 * sepScale);
    for (let j = 0; j < prof.length && k + j < H; j++) {
      rad_rate[k + j] += prof[j];
    }
  }

  return { co2, rad_rate, cabin_temp, humidity, pressure, hours: H, t0 };
}

export function ensure_signals(a) {
  return [
    ...HOURLY_SIGNALS.filter((s) => !(s in a.hourly)),
    ...DAILY_SIGNALS.filter((s) => !(s in a.daily)),
  ];
}
