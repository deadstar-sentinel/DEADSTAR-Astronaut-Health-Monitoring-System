const CACHE = { t: 0, data: null };
const TTL_MS = 1200 * 1000;

export const FALLBACK_SEP = [
  {
    id: "2025-02-25T00:42:00-SEP-001",
    time: "2025-02-25T00:42Z",
    instrument: "SOHO/EPHIN (model)",
    link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/37525/2",
  },
  {
    id: "2024-09-17T07:35:00-SEP-001",
    time: "2024-09-17T07:35Z",
    instrument: "GOES-P: SEISS >10 MeV",
    link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/33467/2",
  },
  {
    id: "2024-01-29T05:11:00-SEP-001",
    time: "2024-01-29T05:11Z",
    instrument: "STEREO A: IMPACT 13-100 MeV",
    link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/28836/2",
  },
  {
    id: "2023-03-14T11:55:00-SEP-001",
    time: "2023-03-14T11:55Z",
    instrument: "GOES-P: SEISS >10 MeV",
    link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/24233/2",
  },
];

async function getJson(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "DEADSTAR-LIFELINE/1.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function donki(kind, start, end) {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  const urls = [
    `https://api.nasa.gov/DONKI/${kind}?startDate=${start}&endDate=${end}&api_key=${key}`,
    `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/${kind}?startDate=${start}&endDate=${end}`,
  ];
  let lastErr = null;
  for (const u of urls) {
    try {
      const data = await getJson(u);
      if (Array.isArray(data)) return { data, src: u.split("?")[0] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(String(lastErr));
}

async function goesProtons() {
  const data = await getJson("https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json");
  const ten = Array.isArray(data) ? data.filter((d) => d.energy === ">=10 MeV") : [];
  if (!ten.length) return null;
  const last = ten[ten.length - 1];
  const flux = Number(last.flux || 0);
  let s = 0;
  for (const [lvl, thr] of [
    [1, 10],
    [2, 100],
    [3, 1e3],
    [4, 1e4],
    [5, 1e5],
  ]) {
    if (flux >= thr) s = lvl;
  }
  return {
    flux_pfu: flux,
    time: last.time_tag,
    s_scale: s,
    series: ten.slice(-96).map((d) => [d.time_tag, Number(d.flux || 0)]),
  };
}

export function summarize(sw) {
  const nowMs = Date.now();
  let level = 0;
  const reasons = [];

  const parse = (ts) => {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? null : t;
  };

  for (const e of sw.sep || []) {
    const t = parse(e.time || "");
    if (t && nowMs - t < 72 * 3600 * 1000 && !sw.cached) {
      level = Math.max(level, 2);
      reasons.push(`Solar energetic particle event ${e.time}`);
    }
  }
  for (const f of sw.flares || []) {
    const t = parse(f.peak || "");
    const cls = f.class || "";
    if (t && nowMs - t < 48 * 3600 * 1000 && cls.startsWith("X")) {
      level = Math.max(level, 1);
      reasons.push(`${cls} flare at ${f.peak}`);
    }
  }
  const g = sw.goes;
  if (g && (g.s_scale || 0) >= 1) {
    level = Math.max(level, g.s_scale >= 2 ? 2 : 1);
    reasons.push(`GOES ≥10 MeV protons ${g.flux_pfu.toFixed(1)} pfu (S${g.s_scale})`);
  }
  const label = ["QUIET", "ELEVATED", "STORM"][level];
  return { level, label, reasons: reasons.slice(0, 4) };
}

export async function fetchSpaceWeather(force = false) {
  if (!force && CACHE.data && Date.now() - CACHE.t < TTL_MS) {
    return CACHE.data;
  }
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const out = {
    fetched: now.toISOString(),
    live: false,
    sources: [],
    sep: [],
    flares: [],
    cme: [],
    goes: null,
    errors: [],
  };

  const results = await Promise.allSettled([
    donki("SEP", start, end),
    donki("FLR", start, end),
    donki("CME", start, end),
    goesProtons(),
  ]);

  if (results[0].status === "fulfilled") {
    const { data, src } = results[0].value;
    out.sep = data
      .map((e) => ({
        id: e.sepID,
        time: e.eventTime,
        instrument: (e.instruments || []).map((i) => i.displayName || "").join(", "),
        link: e.link,
      }))
      .reverse();
    out.sources.push(src);
    out.live = true;
  } else {
    out.errors.push(`DONKI SEP: ${results[0].reason}`);
  }

  if (results[1].status === "fulfilled") {
    const { data } = results[1].value;
    out.flares = data
      .map((e) => ({ id: e.flrID, class: e.classType, peak: e.peakTime, link: e.link }))
      .reverse()
      .slice(0, 25);
    out.live = true;
  } else {
    out.errors.push(`DONKI FLR: ${results[1].reason}`);
  }

  if (results[2].status === "fulfilled") {
    const { data } = results[2].value;
    out.cme = data
      .map((e) => ({ id: e.activityID, time: e.startTime, note: (e.note || "").slice(0, 160), link: e.link }))
      .reverse()
      .slice(0, 15);
  } else {
    out.errors.push(`DONKI CME: ${results[2].reason}`);
  }

  if (results[3].status === "fulfilled" && results[3].value) {
    out.goes = results[3].value;
    out.sources.push("NOAA SWPC GOES integral protons");
    out.live = true;
  } else if (results[3].status === "rejected") {
    out.errors.push(`GOES: ${results[3].reason}`);
  }

  if (!out.sep.length && !out.live) {
    out.sep = FALLBACK_SEP;
    out.cached = true;
  }
  out.summary = summarize(out);
  CACHE.t = Date.now();
  CACHE.data = out;
  return out;
}
