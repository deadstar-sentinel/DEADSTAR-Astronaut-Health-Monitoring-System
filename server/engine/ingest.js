import { HOURLY_SIGNALS, SIGNALS } from "./constants.js";
import { CREW, generate_astronaut } from "./crew.js";

const ALIASES = {
  hr: ["hr", "heart_rate", "heartrate", "pulse", "bpm"],
  hrv: ["hrv", "rmssd", "hrv_rmssd"],
  spo2: ["spo2", "sp02", "oxygen", "oxygen_saturation", "o2sat"],
  rr: ["rr", "resp", "respiratory_rate", "breathing_rate"],
  temp: ["temp", "temperature", "core_temp", "body_temp", "body_temperature"],
  sbp: ["sbp", "systolic", "systolic_bp", "bp_sys"],
  dbp: ["dbp", "diastolic", "diastolic_bp", "bp_dia"],
  sleep_h: ["sleep_h", "sleep", "sleep_hours", "sleep_duration"],
  cognition: ["cognition", "cognitive", "cognition_score"],
  mood: ["mood", "mood_score", "stress"],
  mass: ["mass", "weight", "body_mass"],
  bmd: ["bmd", "bone_density", "hip_bmd"],
  muscle: ["muscle", "strength", "leg_strength"],
  vo2: ["vo2", "vo2max"],
  onsd: ["onsd", "optic_nerve_sheath"],
  plasma: ["plasma", "plasma_volume"],
  dose: ["dose", "radiation", "cumulative_dose"],
  exercise: ["exercise", "exercise_min"],
  glucose: ["glucose", "blood_sugar", "blood_glucose", "bg"],
  pvt: ["pvt", "reaction_time", "rt"],
};
const TIME_KEYS = ["timestamp", "time", "datetime", "date", "t"];
const WHO_KEYS = ["astronaut", "crew", "crew_id", "id", "name", "subject"];

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? "";
    return obj;
  });
}

function parseTime(v) {
  v = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const x = Number(v);
    return new Date((x > 1e11 ? x : x * 1000));
  }
  // Handle DD/MM/YYYY HH:MM
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(v);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0)));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const iso = new Date(v.includes("T") || v.endsWith("Z") ? v : v.replace(" ", "T") + "Z");
  if (!Number.isNaN(iso.getTime())) return iso;
  const fallback = new Date(v);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  throw new Error(`unrecognised time '${v}'`);
}

function interp(xTargets, xs, ys) {
  const out = new Float64Array(xTargets.length);
  for (let i = 0; i < xTargets.length; i++) {
    const x = xTargets[i];
    if (x <= xs[0]) {
      out[i] = ys[0];
    } else if (x >= xs[xs.length - 1]) {
      out[i] = ys[ys.length - 1];
    } else {
      let j = 0;
      while (j < xs.length - 2 && xs[j + 1] < x) j++;
      const t = (x - xs[j]) / (xs[j + 1] - xs[j] || 1);
      out[i] = ys[j] + t * (ys[j + 1] - ys[j]);
    }
  }
  return out;
}

export function parse_csv(text, missionId) {
  const rows = parseCsvRows(text);
  if (!rows.length) throw new Error("CSV has no rows");
  const cols = {};
  for (const c of Object.keys(rows[0])) cols[c.toLowerCase().trim()] = c;

  const tkey = TIME_KEYS.map((k) => cols[k]).find(Boolean);
  if (!tkey) throw new Error("No timestamp column (expected one of: " + TIME_KEYS.join(", ") + ")");
  const wkey = WHO_KEYS.map((k) => cols[k]).find(Boolean) || null;

  const mapping = {};
  for (const [sig, al] of Object.entries(ALIASES)) {
    for (const a of al) {
      if (a in cols) {
        mapping[sig] = cols[a];
        break;
      }
    }
  }
  if (!Object.keys(mapping).length) throw new Error("No recognised signal columns");

  const groups = {};
  for (const r of rows) {
    const who = wkey ? (r[wkey] || "uploaded").trim().toLowerCase() : "uploaded";
    (groups[who] ||= []).push(r);
  }

  const result = {};
  const report = [];
  const crewIds = Object.fromEntries(CREW.map((c) => [c.id, c]));
  const byName = {
    ...Object.fromEntries(CREW.map((c) => [c.name.toLowerCase(), c])),
    ...Object.fromEntries(CREW.map((c) => [c.name.split(" ").slice(-1)[0].toLowerCase(), c])),
    ...Object.fromEntries(CREW.map((c) => [c.short.toLowerCase(), c])),
  };

  for (const [who, rs] of Object.entries(groups)) {
    const meta = crewIds[who] || byName[who];
    let target = meta ? meta.id : null;
    if (!target) {
      const free = CREW.filter((c) => !(c.id in result));
      if (!free.length) continue;
      target = free[free.length - 1].id;
    }
    const base = generate_astronaut(crewIds[target], missionId);
    const times = rs.map((r) => parseTime(r[tkey]));
    const tEndMs = Math.max(...times.map((t) => t.getTime()));
    const tMinMs = Math.min(...times.map((t) => t.getTime()));
    const tEndDay = Math.floor(tEndMs / 86400000);
    const used = [];

    for (const [sig, col] of Object.entries(mapping)) {
      const vals = [];
      for (let i = 0; i < rs.length; i++) {
        const num = Number(rs[i][col]);
        if (rs[i][col] !== "" && Number.isFinite(num)) vals.push([times[i], num]);
      }
      if (vals.length < 3) continue;

      if (HOURLY_SIGNALS.includes(sig)) {
        const n = base.hours;
        const buckets = new Map();
        for (const [t, v] of vals) {
          const k = n - 1 - Math.floor((tEndMs - t.getTime()) / 3600000);
          if (k >= 0 && k < n) {
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(v);
          }
        }
        if (buckets.size < 72) continue;
        const ks = [...buckets.keys()].sort((a, b) => a - b);
        const ys = ks.map((k) => {
          const arr = buckets.get(k);
          return arr.reduce((a, b) => a + b, 0) / arr.length;
        });
        const targets = [];
        for (let k = ks[0]; k < n; k++) targets.push(k);
        const filled = interp(targets, ks, ys);
        const arr = new Float64Array(base.hourly[sig]);
        for (let i = 0; i < filled.length; i++) arr[ks[0] + i] = filled[i];
        base.hourly[sig] = arr;
        used.push(sig);
      } else if (sig in base.daily) {
        const n = base.days;
        const buckets = new Map();
        for (const [t, v] of vals) {
          const tDay = Math.floor(t.getTime() / 86400000);
          const k = n - 1 - (tEndDay - tDay);
          if (k >= 0 && k < n) {
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(v);
          }
        }
        if (buckets.size < 3) continue;
        const ks = [...buckets.keys()].sort((a, b) => a - b);
        const ys = ks.map((k) => {
          const arr = buckets.get(k);
          return arr.reduce((a, b) => a + b, 0) / arr.length;
        });
        const targets = [];
        for (let k = ks[0]; k < n; k++) targets.push(k);
        const filled = interp(targets, ks, ys);
        const arr = new Float64Array(base.daily[sig]);
        for (let i = 0; i < filled.length; i++) arr[ks[0] + i] = filled[i];
        base.daily[sig] = arr;
        used.push(sig);
      }
    }

    if (used.length) {
      base.source = "uploaded";
      result[target] = base;
      report.push({
        group: who,
        mapped_to: target,
        signals: used,
        rows: rs.length,
        span_hours: Math.round(((tEndMs - tMinMs) / 3600000) * 10) / 10,
      });
    }
  }

  if (!Object.keys(result).length) {
    throw new Error("Nothing usable: need ≥72 hourly samples or ≥3 daily samples per signal");
  }
  return [result, { columns: mapping, groups: report }];
}

export function template_csv(st, cid = "haddad", hours = 96) {
  const a = st.crew[cid];
  const sigs = HOURLY_SIGNALS;
  const lines = [["timestamp", "astronaut", ...sigs].join(",")];
  for (let k = a.hours - hours; k < a.hours; k++) {
    const t = new Date(a.t0.getTime() + k * 3600000);
    const ts = t.toISOString().slice(0, 19) + "Z";
    const row = [ts, cid, ...sigs.map((s) => a.hourly[s][k].toFixed(SIGNALS[s].decimals + 1))];
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}
