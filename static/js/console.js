import { createHologram } from "./hologram.js";
import { fanChart, lineChart, sparkline, fmt } from "./charts.js";
import { speak, stopSpeaking, listen, voiceAvailable } from "./voice.js";
import { openPVT } from "./pvt.js";
import { connectSerial } from "./serial.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const api = async (p, o) => { const r = await fetch(p, o); if (!r.ok) throw new Error((await r.text()) || r.status); return r.json(); };
const post = (p, b) => api(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = msg => { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200); };
const bandLabel = { nominal: "Nominal", watch: "Watch", act: "Act" };
const bandGlyph = { nominal: "○", watch: "◐", act: "●" };

const S = { meta: null, st: null, crew: null, detail: null, signal: "temp", horizon: "24h", pane: "risk", openAlert: null,
  live: null, wi: {}, raceTimer: null };

const SIG_TABS = [
  ["temp", "Core temp"], ["hr", "Heart rate"], ["hrv", "HRV"], ["spo2", "SpO₂"], ["rr", "Resp. rate"], ["sbp", "Blood pressure"],
  ["glucose", "Blood sugar"], ["sleep_h", "Sleep"], ["mood", "Mood"], ["cognition", "Cognition"],
  ["bmd", "Hip bone"], ["onsd", "Optic nerve"], ["muscle", "Leg strength"], ["vo2", "VO₂max"], ["dose", "Radiation dose"],
];
const HOURLY = new Set(["hr", "hrv", "spo2", "rr", "temp", "sbp", "dbp"]);
const H_KEYS = [["24h", "24 H"], ["48h", "48 H"], ["72h", "72 H"], ["7d", "7 D"], ["30d", "30 D"], ["90d", "90 D"], ["end", "MISSION END"]];

let holo;

/* ------------------------------------------------------------------ boot */
async function boot() {
  S.meta = await api("/api/meta");
  buildStatic();
  holo = createHologram($("#holo"), { labelsEl: $("#organLabels"), onRegion: openRegion, modelAvailable: S.meta.model_glb });
  tick(); setInterval(tick, 1000);
  await refresh(true);
  setInterval(() => refresh(false), 60000);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", debounce(() => { renderForecast(); if (S.pane === "whatif") renderWhatIf(); }, 200));
}

function buildStatic() {
  const ms = $("#missionSeg");
  ms.innerHTML = S.meta.missions.map(m => `<button data-m="${m.id}" title="${esc(m.description)}">${esc(m.short)}</button>`).join("");
  ms.onclick = async e => { const b = e.target.closest("button"); if (!b) return; await post("/api/control", { mission: b.dataset.m }); toast(`Mission profile: ${b.textContent}`); refresh(true); };
  const ss = $("#scenarioSeg");
  ss.innerHTML = Object.entries(S.meta.scenarios).map(([k, v]) => `<button data-s="${k}" title="${esc(v.desc)}"><span class="kbd">${v.key}</span>${esc(v.label.split(" ")[0])}</button>`).join("");
  ss.onclick = e => { const b = e.target.closest("button"); if (b) setScenario(b.dataset.s); };
  $("#sigTabs").innerHTML = SIG_TABS.map(([k, l]) => `<button data-s="${k}">${l}</button>`).join("");
  $("#sigTabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.signal = b.dataset.s; renderForecast(); };
  $("#horizonSeg").innerHTML = H_KEYS.map(([k, l]) => `<button data-h="${k}">${l}</button>`).join("");
  $("#horizonSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.horizon = b.dataset.h; renderForecast(); };
  $("#deckTabs").onclick = e => { const b = e.target.closest("button"); if (b) showPane(b.dataset.pane); };
  $("#drawerClose").onclick = () => { $("#drawer").classList.remove("open"); holo.setFocus(null); };
  $("#modalClose").onclick = closeModal; $("#modal").onclick = e => { if (e.target.id === "modal") closeModal(); };
  $("#askForm").onsubmit = e => { e.preventDefault(); ask($("#askInput").value); };
  $("#suggest").innerHTML = ["Who needs attention first?", "Is Vasquez cleared for the burn?", "Will Mori develop a fever?", "Is it the ship or the crew?", "How far is Earth right now?"]
    .map(q => `<button>${q}</button>`).join("");
  $("#suggest").onclick = e => { const b = e.target.closest("button"); if (b) { $("#askInput").value = b.textContent; ask(b.textContent); } };
  $("#micBtn").onclick = () => {
    if (!voiceAvailable().listen) return toast("Voice input needs Chrome or Edge.");
    $("#micBtn").classList.add("primary");
    listen(txt => { $("#micBtn").classList.remove("primary"); if (txt) { $("#askInput").value = txt; ask(txt); } });
  };
  $("#speakBtn").onclick = async () => { const b = await api("/api/briefing"); talk(b.text); };
  $("#pvtOpen").onclick = e => { e.preventDefault(); openPVT({ modal: openModal, close: closeModal, crew: S.crew, onDone: () => refresh(false) }); };
  $("#serialBtn").onclick = startSerial;
  $("#dayRange").oninput = onDay;
  $("#csvFile").onchange = uploadCSV;
  $("#resetData").onclick = async () => { await api("/api/ingest", { method: "DELETE" }); toast("Back to the synthetic crew."); refresh(true); };
  $("#logForm").onsubmit = async e => {
    e.preventDefault();
    try { await post("/api/log", { crew: $("#logCrew").value, signal: $("#logSig").value, value: $("#logVal").value }); toast("Logged. Forecasts updated."); refresh(true); }
    catch (err) { toast("Could not log: " + err.message); }
  };
  renderMethods();
  try {
    const q = window.qrcode(0, "M"); q.addData(location.origin + "/astronaut"); q.make();
    $("#qr").innerHTML = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    const sv = $("#qr svg"); if (sv) { sv.style.width = "100%"; sv.style.height = "100%"; }
  } catch (e) { $("#qr").style.display = "none"; }
}

function onKey(e) {
  if (e.target.matches("input, textarea, select")) return;
  const sc = Object.entries(S.meta.scenarios).find(([, v]) => v.key === e.key);
  if (sc) setScenario(sc[0]);
  if (e.key === "b") $("#speakBtn").click();
  if (e.key === "Escape") { closeModal(); $("#drawer").classList.remove("open"); stopSpeaking(); }
}

async function setScenario(k) {
  await post("/api/control", { scenario: k });
  toast(`Scenario: ${S.meta.scenarios[k].label}`);
  await refresh(true);
  if (k !== "baseline") { const b = await api("/api/briefing"); $("#brief").textContent = b.text; }
}

function tick() {
  const d = new Date();
  $("#utc").textContent = d.toISOString().slice(11, 19);
  if (S.st) {
    const m = S.st.met; const mins = d.getUTCMinutes(), secs = d.getUTCSeconds();
    $("#met").textContent = `MET ${String(m.day).padStart(3, "0")}/${String(m.hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
}

/* ------------------------------------------------------------------ refresh */
async function refresh(full) {
  try { S.st = await api("/api/state"); } catch (e) { toast("Server busy — retrying"); return; }
  const st = S.st;
  $$("#missionSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === st.mission.id));
  $$("#scenarioSeg button").forEach(b => b.classList.toggle("on", b.dataset.s === st.scenario));
  const ow = st.light.owlt_s;
  $("#owlt").textContent = ow >= 60 ? `${Math.floor(ow / 60)}m ${String(Math.round(ow % 60)).padStart(2, "0")}s` : `${ow.toFixed(2)} s`;
  const rt = 2 * ow;
  $("#rtt").textContent = rt >= 60 ? `${Math.floor(rt / 60)}m ${String(Math.round(rt % 60)).padStart(2, "0")}s` : `${rt.toFixed(2)} s`;
  const sw = st.space_weather;
  $("#swLabel").textContent = `${sw.summary?.label || "—"}${sw.cached ? " · cached" : sw.live ? " · live" : ""}`;
  $("#swDot").className = "dot live" + (sw.summary?.level >= 2 ? " act" : sw.summary?.level === 1 ? " watch" : "");
  renderCrew(); renderVerdict(); renderAlerts(); renderGuests(); renderMatrix();
  $("#logCrew").innerHTML = st.crew.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if (!S.crew || !st.crew.find(c => c.id === S.crew)) {
    const firstAct = st.alerts.find(a => a.crew && a.severity === "act");
    S.crew = firstAct ? firstAct.crew : st.crew[0].id;
  }
  await selectCrew(S.crew, full);
  if (full) { const b = await api("/api/briefing"); $("#brief").textContent = b.text; }
  if (S.pane === "earth") renderEarth();
  if (S.pane === "rad") renderRad();
}

/* ------------------------------------------------------------------ crew */
function renderCrew() {
  const st = S.st;
  $("#crewCount").textContent = `${st.crew.length} aboard · ${st.mission.short}`;
  $("#crewList").innerHTML = st.crew.map(c => {
    const at = c.attribution?.attribution;
    const atChip = at && at !== "none" ? `<span class="chip ${at === "ship" ? "watch" : "act"}">${at === "ship" ? "Ship" : at === "both" ? "Ship + body" : "Body"}</span>` : "";
    const top = c.top_risks[0];
    const rname = S.meta.risks.find(r => r.id === top.id)?.name || top.id;
    return `<div class="crew-card ${c.id === S.crew ? "sel" : ""}" data-c="${c.id}">
      <div><div class="crew-name">${esc(c.name)}</div><div class="crew-role">${esc(c.short)} · ${esc(c.role)}${c.source === "uploaded" ? " · uploaded data" : ""}</div></div>
      <div class="crew-hi"><span class="n" style="color:${c.status === "act" ? "#f19ae0" : c.status === "watch" ? "#f0b660" : "var(--ink)"}">${Math.round(c.health_index)}</span><span class="u">HEALTH</span></div>
      <div class="crew-meta"><span class="chip ${c.status}"><span class="glyph">${bandGlyph[c.status]}</span>${bandLabel[c.status]}</span>
        <span class="chip" title="Highest risk">${esc(rname)} ${Math.round(top.score)}</span>${atChip}</div>
      <div class="crew-spark" data-spark="${c.id}"></div>
    </div>`;
  }).join("");
  st.crew.forEach(c => sparkline($(`[data-spark="${c.id}"]`), c.spark.temp, { color: c.status === "act" ? "#e05cc6" : "#8fa3b5", ref: 38.0, refColor: "var(--act)" }));
  $$(".crew-card").forEach(n => n.onclick = () => selectCrew(n.dataset.c, true));
}

async function selectCrew(cid, full) {
  S.crew = cid;
  $$(".crew-card").forEach(n => n.classList.toggle("sel", n.dataset.c === cid));
  S.detail = await api(`/api/crew/${cid}`);
  const d = S.detail, s = d.summary;
  $("#whoName").textContent = s.name;
  $("#whoRole").textContent = `${s.short} · ${s.role} · age ${s.age}`;
  const v = s.vitals;
  $("#whoVitals").innerHTML = [
    ["HR", fmt(S.live?.hr ?? v.hr, 0), "bpm", S.live?.hr], ["SpO₂", fmt(S.live?.spo2 ?? v.spo2, 1), "%", S.live?.spo2], ["Temp", fmt(v.temp, 2), "°C"],
    ["BP", `${fmt(v.sbp, 0)}/${fmt(v.dbp, 0)}`, "mmHg"], ["HRV", fmt(v.hrv, 0), "ms"], ["Resp", fmt(v.rr, 1), "/min"],
  ].map(([k, val, u, live]) => `<div><div class="lbl">${k}${live ? ' <span style="color:var(--accent)">· live</span>' : ""}</div><div class="v">${val}<small>${u}</small></div></div>`).join("");
  $("#whoStatus").className = `chip ${s.status}`;
  $("#whoStatus").innerHTML = `<span class="glyph">${bandGlyph[s.status]}</span>${bandLabel[s.status]} · health ${Math.round(s.health_index)}`;
  const at = d.attribution?.attribution;
  if (at && at !== "none") { $("#whoAttr").style.display = ""; $("#whoAttr").className = `chip ${at === "ship" ? "watch" : "act"}`; $("#whoAttr").textContent = at === "ship" ? "Cause: ship" : at === "both" ? "Cause: ship + body" : "Cause: body"; }
  else $("#whoAttr").style.display = "none";
  holo.setOrgans(d.organs);
  holo.setHeartRate(S.live?.hr ?? v.hr);
  const dr = $("#dayRange"); dr.max = d.mission_day; if (full) dr.value = d.mission_day; onDay();
  renderForecast();
  if (S.pane === "whatif") renderWhatIf(true);
  if (S.pane === "ready") renderReady();
  if (S.pane === "rad") renderRad();
  if ($("#drawer").classList.contains("open") && S.region) openRegion(S.region);
}

function onDay() {
  const d = S.detail; if (!d) return;
  const day = +$("#dayRange").value, max = d.mission_day;
  const p = max ? day / max : 1;
  const bmd = d.daily_all.bmd, idx = Math.min(bmd.length - 1, day);
  const loss = (100 - bmd[idx]) / 100;
  holo.setProgress(p, loss);
  const plasma = d.daily_all.plasma[idx], musc = d.daily_all.muscle[idx];
  $("#dayLabel").innerHTML = `DAY ${day} · <span style="color:var(--ink)">bone −${fmt(100 - bmd[idx], 1)}%</span> · fluid ${fmt(plasma - 100, 0)}% · muscle ${fmt(musc - 100, 0)}%`;
  $("#dayLabel").style.minWidth = "auto";
}

/* ------------------------------------------------------------------ verdict + env */
function renderVerdict() {
  const v = S.st.ship_vs_body;
  const cls = { SHIP: "ship", BODY: "body", BOTH: "both", NOMINAL: "" }[v.verdict];
  $("#verdict").className = `panel verdict ${cls}`;
  $("#verdictText").innerHTML = `<span class="verdict-tag">${v.verdict}</span><br>${esc(v.headline)}`;
  $("#verdictEvidence").innerHTML = v.evidence.map(e => `<li>${esc(e)}</li>`).join("");
  const env = S.st.env;
  $("#envGrid").innerHTML = ["co2", "rad_rate", "cabin_temp", "humidity"].map(k => {
    const e = env[k];
    const alarm = e.threshold ? e.now > e.threshold.value : (k === "rad_rate" && S.st.ship_vs_body.rad_ratio > 5);
    return `<div class="env-cell ${alarm ? "alarm" : ""}" title="${esc(e.label)}"><div class="lbl">${esc(e.label)}</div><div class="v">${fmt(e.now, k === "co2" ? 2 : k === "rad_rate" ? 0 : 1)}<small>${esc(e.unit)}</small></div><div data-env="${k}"></div></div>`;
  }).join("");
  ["co2", "rad_rate", "cabin_temp", "humidity"].forEach(k => {
    const e = env[k];
    sparkline($(`[data-env="${k}"]`), e.series, { height: 18, color: "#6f8396", ref: e.threshold?.value, refColor: "var(--act)" });
  });
}

/* ------------------------------------------------------------------ forecast */
async function renderForecast() {
  if (!S.crew) return;
  const sig = S.signal;
  let hz = S.horizon;
  if (!HOURLY.has(sig) && ["24h", "48h", "72h"].includes(hz)) hz = "7d";
  $$("#sigTabs button").forEach(b => b.classList.toggle("on", b.dataset.s === sig));
  $$("#horizonSeg button").forEach(b => { b.classList.toggle("on", b.dataset.h === hz); b.disabled = !HOURLY.has(sig) && ["24h", "48h", "72h"].includes(b.dataset.h); b.style.opacity = b.disabled ? .35 : 1; });
  let f;
  try { f = await api(`/api/forecast/${S.crew}/${sig}?horizon=${hz}`); } catch (e) { $("#fcChart").innerHTML = `<div class="dim" style="padding:20px">No forecast for this signal.</div>`; return; }
  const name = S.detail?.summary?.name?.split(" ").slice(-1)[0] || "";
  $("#fcTitle").textContent = `${name} · ${f.meta.label} (${f.meta.unit}) · ${hz === "end" ? "to mission end" : "next " + hz.replace("h", " h").replace("d", " days")}`;
  fanChart($("#fcChart"), f, { height: 262 });
  const side = [];
  const dec = f.meta.decimals;
  const last = f.mean[f.mean.length - 1];
  if (f.threshold) {
    const p = f.threshold.peak_prob ?? f.threshold.prob_at_horizon;
    const lbl = f.resolution === "hour" ? `peak hourly probability, in ${f.threshold.peak_in_h} h` : `by ${hz === "end" ? "mission end" : "+" + f.horizon + " days"}`;
    side.push(`<div><div class="lbl">P(${esc(f.threshold.label)})</div><div class="big-prob" style="color:${p >= .5 ? "#f19ae0" : p >= .2 ? "#f0b660" : "var(--ink)"}">${Math.round(p * 100)}<small>%</small></div><div class="dim" style="font-size:11px;margin-top:4px">${lbl}</div></div>`);
  } else {
    side.push(`<div><div class="lbl">Forecast at horizon</div><div class="big-prob">${fmt(last, dec)}<small> ${esc(f.meta.unit)}</small></div><div class="dim" style="font-size:11px;margin-top:4px">80% band ${fmt(f.lo80.at(-1), dec)} – ${fmt(f.hi80.at(-1), dec)}</div></div>`);
  }
  const rows = [];
  if (f.resolution === "hour") {
    const bt = f.backtest; const hrow = bt.horizons.find(x => x.h >= Math.min(f.horizon, 24)) || bt.horizons.at(-1);
    const hrow2 = bt.horizons.filter(x => x.h <= f.horizon).at(-1) || hrow;
    rows.push(["Evidence", `<span class="evid ${f.calibrated ? "ok" : "prior"}">${f.calibrated ? "Backtested" : "Uncalibrated"}</span>`]);
    rows.push([`MAE at ${hrow2.h} h`, `${fmt(hrow2.mae, dec + 1)} ${esc(f.meta.unit)}`]);
    rows.push([`Skill vs naive (${hrow2.h} h)`, `${hrow2.skill >= 0 ? "+" : ""}${Math.round(hrow2.skill * 100)}%`]);
    rows.push(["80% band coverage", bt.coverage80 != null ? `${Math.round(bt.coverage80 * 100)}%` : "—"]);
    rows.push(["95% band coverage", bt.coverage95 != null ? `${Math.round(bt.coverage95 * 100)}%` : "—"]);
    rows.push(["Backtest origins", `${bt.n_origins}`]);
  } else {
    const ev = f.evidence;
    rows.push(["Evidence", `<span class="evid ${ev === "backtested" ? "ok" : "prior"}">${esc(ev)}</span>`]);
    const k = Object.keys(f.backtest).filter(k => f.backtest[k]).map(Number).filter(x => x <= f.horizon).pop() || Object.keys(f.backtest).filter(k => f.backtest[k]).map(Number)[0];
    const b = k ? f.backtest[k] : null;
    if (b) { rows.push([`MAE at ${k} d`, `${fmt(b.mae, dec + 1)} ${esc(f.meta.unit)}`]); rows.push([`Skill vs naive (${k} d)`, `${b.skill >= 0 ? "+" : ""}${Math.round(b.skill * 100)}%`]); rows.push(["80% coverage", `${Math.round(b.coverage80 * 100)}%`]); }
    const perMonth = f.slope_per_day * 30, prior = f.prior_slope * 30;
    rows.push(["Personal trend", `${perMonth >= 0 ? "+" : ""}${fmt(perMonth, dec > 1 ? 3 : 2)}/mo`]);
    rows.push(["NASA prior", `${prior >= 0 ? "+" : ""}${fmt(prior, dec > 1 ? 3 : 2)}/mo`]);
    rows.push(["Days to mission end", `${f.mission_days_left}`]);
  }
  side.push(`<div>${rows.map(([k, v]) => `<div class="stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}</div>`);
  side.push(`<div class="dim" style="font-size:10.5px;line-height:1.45">${f.resolution === "hour" ? "Seasonal-profile model on the last 14 days with split-conformal intervals from rolling backtests." : "Bayesian trend: NASA population rate as prior, this astronaut's measurements as likelihood."}</div>`);
  $("#fcSide").innerHTML = side.join("");
}

/* ------------------------------------------------------------------ alerts */
function renderAlerts() {
  const st = S.st;
  const auto = st.alerts.filter(a => a.autonomous).length;
  $("#officerSub").textContent = `${st.alerts.filter(a => a.severity === "act").length} act · ${st.alerts.filter(a => a.severity === "watch").length} watch · ${auto} handled onboard`;
  $("#alerts").innerHTML = st.alerts.map(a => {
    const who = a.crew ? st.crew.find(c => c.id === a.crew)?.short : "SHIP";
    const proto = S.meta.protocols[a.protocol];
    const done = JSON.parse(sessionStorage.getItem("steps:" + a.id) || "[]");
    return `<div class="alert ${a.severity} ${S.openAlert === a.id ? "open" : ""}" data-a="${a.id}">
      <div class="alert-top"><span class="chip ${a.severity}"><span class="glyph">${bandGlyph[a.severity]}</span>${bandLabel[a.severity]}</span><span class="lbl">${esc(who)} · ${esc(S.meta.risks.find(r => r.id === a.risk)?.name || a.risk)}</span></div>
      <div class="alert-title">${esc(a.title)}</div>
      <div class="alert-detail">${esc(a.detail)}</div>
      <div class="alert-body">
        <div class="autonomy">
          <div class="row"><span class="k">Must act within</span><span>${fmtMin(a.act_within_min)}</span></div>
          <div class="row"><span class="k">Earth round trip</span><span>${fmtMin(a.earth_round_trip_min)}</span></div>
          <div class="row"><span class="k">Earth answer, incl. ground team</span><span>${fmtMin(a.earth_reply_min)}</span></div>
          <div class="decision ${a.autonomous ? "auto" : ""}">${a.autonomous ? "▶ SENTINEL ACTS ONBOARD — Earth would answer too late" : "◇ CONSULT EARTH — time allows a ground decision"}</div>
        </div>
        ${a.lead_hours ? `<div class="stat-row"><span class="k">Early warning lead time</span><span class="v" style="color:var(--accent)">${a.lead_hours} h before forecast fever</span></div>` : ""}
        ${proto ? `<div class="lbl" style="margin-top:10px">${esc(proto.title)}</div><ol class="steps">${proto.steps.map((s, i) => `<li class="${done.includes(i) ? "done" : ""}"><input type="checkbox" data-step="${i}" ${done.includes(i) ? "checked" : ""}><span>${esc(s)}</span></li>`).join("")}</ol>` : ""}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          ${a.crew ? `<button class="btn sm" data-act="forecast">Open forecast</button>` : ""}
          ${a.protocol === "sans" ? `<button class="btn sm primary" data-act="exam">Guided eye exam</button>` : ""}
          <button class="btn sm" data-act="earth">Send to Earth</button>
          <button class="btn sm ghost" data-act="speak">Read aloud</button>
        </div>
      </div>
    </div>`;
  }).join("") || `<div class="pb dim" style="padding-top:14px">No alerts. Crew and ship nominal.</div>`;
  $$(".alert").forEach(n => {
    n.onclick = e => {
      const id = n.dataset.a, a = st.alerts.find(x => x.id === id);
      const act = e.target.closest("[data-act]");
      const step = e.target.closest("[data-step]");
      if (step) {
        const k = "steps:" + id; const arr = JSON.parse(sessionStorage.getItem(k) || "[]"); const i = +step.dataset.step;
        const nx = step.checked ? [...new Set([...arr, i])] : arr.filter(x => x !== i); sessionStorage.setItem(k, JSON.stringify(nx));
        step.closest("li").classList.toggle("done", step.checked); e.stopPropagation(); return;
      }
      if (act) {
        e.stopPropagation();
        if (act.dataset.act === "forecast") { selectCrew(a.crew, false).then(() => { S.signal = ({ immune: "temp", sleep: "sleep_h", sans: "onsd", bone: "bmd" })[a.risk] || "temp"; S.horizon = ({ sans: "end", bone: "end", sleep: "7d" })[a.risk] || "24h"; renderForecast(); }); }
        if (act.dataset.act === "exam") openExam("ocular_ultrasound");
        if (act.dataset.act === "earth") { S.raceAlert = a; showPane("earth"); document.getElementById("pane-earth").scrollIntoView({ behavior: "smooth" }); }
        if (act.dataset.act === "speak") talk(`${a.title}. ${a.detail} ${a.autonomous ? "Earth would answer too late, so I have started the onboard protocol." : ""}`);
        return;
      }
      if (S.openAlert === id) return;
      S.openAlert = id; renderAlerts();
      if (a.crew && a.crew !== S.crew) selectCrew(a.crew, false);
    };
  });
}
const fmtMin = m => m >= 1440 ? `${fmt(m / 1440, 1)} days` : m >= 120 ? `${fmt(m / 60, 1)} h` : m >= 1 ? `${fmt(m, 1)} min` : `${fmt(m * 60, 1)} s`;

function renderGuests() {
  const g = S.st.pvt_guests || [];
  if (!g.length) return;
  $("#guests").innerHTML = g.slice().reverse().map(x => `<div class="stat-row"><span class="k">${esc(x.name)}${x.crew ? ` · ${esc(x.crew)}` : ""}</span><span class="v">${x.median_ms} ms</span></div>`).join("");
}

/* ------------------------------------------------------------------ talk / ask */
function talk(text) {
  $("#orb").classList.add("speaking");
  speak(text, () => $("#orb").classList.remove("speaking"));
}
async function ask(q) {
  if (!q.trim()) return;
  const a = $("#answer"); a.style.display = "block"; a.innerHTML = `<span class="dim">Thinking…</span>`;
  try {
    const r = await post("/api/ask", { q, crew: S.crew });
    a.innerHTML = `${esc(r.text)}<span class="src">${r.engine === "claude" ? "Claude" : "SENTINEL rules engine"} · grounded in: ${esc((r.facts || []).join(", "))}</span>`;
    talk(r.text);
    if (r.crew && r.crew !== S.crew) selectCrew(r.crew, false);
  } catch (e) { a.textContent = "No answer: " + e.message; }
}

/* ------------------------------------------------------------------ region drawer */
function openRegion(k) {
  S.region = k;
  const R = S.meta.regions[k]; if (!R || !S.detail) return;
  const d = S.detail, s = d.summary;
  $("#drawerTitle").textContent = `${R.label} — ${s.name.split(" ").slice(-1)[0]}`;
  const val = sig => {
    const meta = S.meta.signals[sig];
    if (sig === "co2") return `${fmt(S.st.env.co2.now, 2)} mmHg`;
    const v = s.vitals[sig] ?? s.daily[sig];
    return v === undefined ? "—" : `${fmt(v, meta?.decimals ?? 1)} ${meta?.unit || ""}`;
  };
  const risks = R.risks.map(rid => { const r = d.risks[rid]; const meta = S.meta.risks.find(x => x.id === rid);
    return `<div class="stat-row"><a href="${meta.url}" target="_blank" rel="noopener" class="k">${esc(meta.name)}</a><span class="v"><span class="chip ${r.band}">${Math.round(r.score)}</span></span></div><div class="dim" style="font-size:11px;padding:2px 0 6px">${esc(r.drivers.join(" · "))}</div>`; }).join("");
  const inds = R.indicators.map(sig => {
    const I = S.meta.indicators[sig]; if (!I) return "";
    return `<div class="ind-head"><span class="n">${esc(I.name)}</span><span class="v">${val(sig)}</span></div>
      ${[["Measured in space?", I.measure], ["Why it matters", I.why], ["How space changes it", I.hazards], ["When to act / escalate", I.act], ["Prevention", I.prevent]]
        .map(([q, a]) => `<div class="qa"><div class="q">${q}</div><div class="a">${esc(a)}</div></div>`).join("")}`;
  }).join("");
  $("#drawerBody").innerHTML = `<div class="lbl" style="margin-bottom:6px">NASA HRP risks here</div>${risks}
    ${R.exam ? `<button class="btn primary" style="margin:10px 0" id="examBtn">Start guided self-exam</button>` : ""}
    ${inds}`;
  if (R.exam) $("#examBtn").onclick = () => openExam(R.exam);
  $("#drawer").classList.add("open");
  holo.setFocus(k);
}

/* ------------------------------------------------------------------ modal / exam */
function openModal(title, html) { $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modal").classList.add("open"); }
function closeModal() { $("#modal").classList.remove("open"); stopSpeaking(); }
function openExam(key) {
  const ex = S.meta.exams[key]; let i = 0;
  const draw = () => {
    openModal(ex.title, `<div class="lbl">Medical kit</div><div class="muted" style="font-size:12px;margin:4px 0 14px">${ex.kit.map(esc).join(" · ")}</div>
      <div class="exam-prog">${ex.steps.map((_, j) => `<span class="${j <= i ? "on" : ""}"></span>`).join("")}</div>
      <div class="lbl">Step ${i + 1} of ${ex.steps.length}</div><div class="exam-step">${esc(ex.steps[i].say)}</div>
      <div style="display:flex;justify-content:space-between;margin-top:14px"><button class="btn" id="exPrev" ${i === 0 ? "disabled" : ""}>Back</button>
      <div style="display:flex;gap:6px"><button class="btn ghost" id="exSay">Repeat</button><button class="btn primary" id="exNext">${i === ex.steps.length - 1 ? "Finish" : "Next step"}</button></div></div>`);
    talk(ex.steps[i].say); holo.setFocus(ex.steps[i].region);
    $("#exPrev").onclick = () => { i = Math.max(0, i - 1); draw(); };
    $("#exSay").onclick = () => talk(ex.steps[i].say);
    $("#exNext").onclick = () => { if (i === ex.steps.length - 1) { closeModal(); toast("Exam logged. Forecast will update with the new measurement."); } else { i++; draw(); } };
  };
  draw();
}

/* ------------------------------------------------------------------ deck */
function showPane(p) {
  S.pane = p;
  $$("#deckTabs button").forEach(b => b.classList.toggle("on", b.dataset.pane === p));
  $$(".deck-pane").forEach(n => n.classList.toggle("on", n.id === "pane-" + p));
  ({ risk: renderMatrix, whatif: () => renderWhatIf(true), earth: renderEarth, ready: renderReady, rad: renderRad, score: renderScore }[p] || (() => {}))();
}

function renderMatrix() {
  const st = S.st; if (!st) return;
  const risks = S.meta.risks;
  const band = v => v >= 60 ? "act" : v >= 30 ? "watch" : "nominal";
  $("#matrix").innerHTML = `<table class="matrix"><thead><tr><th></th>${risks.map(r => `<th class="rot"><div><a href="${r.url}" target="_blank" rel="noopener">${esc(r.name)}</a></div></th>`).join("")}</tr></thead><tbody>
    ${st.crew.map(c => `<tr><td class="name">${esc(c.name)}</td>${risks.map(r => { const v = st.risk_matrix[c.id][r.id]; return `<td><div class="cell ${band(v)}" title="${esc(c.name)} · ${esc(r.name)}: ${Math.round(v)} (${bandLabel[band(v)]})">${Math.round(v)}</div></td>`; }).join("")}</tr>`).join("")}
  </tbody></table>`;
}

async function renderWhatIf(reset) {
  const cid = S.crew; if (!cid) return;
  $("#wiWho").textContent = S.detail?.summary?.name || cid;
  if (reset || !S.wi[cid]) { S.wi[cid] = (await api(`/api/whatif/${cid}`)).defaults; }
  const p = S.wi[cid];
  const ctrl = (k, label, min, max, step, unit, note) => `<div class="ctrl"><div class="top-row"><span>${label}</span><span class="v" id="wv-${k}">${p[k]}${unit}</span></div><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${p[k]}">${note ? `<div class="note">${note}</div>` : ""}</div>`;
  const tog = (k, label, note) => `<div class="ctrl"><label class="toggle"><input type="checkbox" data-k="${k}" ${p[k] ? "checked" : ""}> ${label}</label><div class="note">${note}</div></div>`;
  $("#wiCtrls").innerHTML = ctrl("exercise_min", "Exercise per day", 0, 240, 5, " min", "Resistive + aerobic; current average shown at load") +
    ctrl("sleep_h", "Sleep per night", 4, 9, 0.1, " h") +
    tog("bisphosphonate", "Bisphosphonate with exercise", "LeBlanc et al. 2013 — flight surgeon decision") +
    tog("b_vitamin", "Daily B-vitamin supplement", "Investigational — NASA B-Complex study") +
    ctrl("thigh_cuff_h", "Thigh cuffs per day", 0, 10, 0.5, " h", "Investigational — NASA Thigh Cuff study") +
    ctrl("shelter", "Storm-shelter compliance", 0, 1, 0.05, "", "Share of solar-particle-event time spent sheltered");
  $$("#wiCtrls input").forEach(inp => inp.oninput = debounce(async () => {
    const k = inp.dataset.k;
    p[k] = inp.type === "checkbox" ? inp.checked : +inp.value;
    const lab = $(`#wv-${k}`); if (lab) lab.textContent = `${p[k]}${{ exercise_min: " min", sleep_h: " h", thigh_cuff_h: " h" }[k] || ""}`;
    drawWI(await post(`/api/whatif/${cid}`, p));
  }, 120));
  drawWI(await post(`/api/whatif/${cid}`, p));
}
function drawWI(r) {
  const e = r.end;
  const card = (k, label, dec, pct) => {
    const x = e[k]; const good = x.better === "higher" ? x.delta > 0.0001 : x.delta < -0.0001; const bad = x.better === "higher" ? x.delta < -0.0001 : x.delta > 0.0001;
    const f = v => pct ? `${Math.round(v * 100)}%` : fmt(v, dec);
    return `<div class="wi-card"><div class="lbl">${label}</div><div class="v">${f(x.scenario)}<small style="font-size:11px;color:var(--ink-3)"> ${pct ? "" : esc(x.unit)}</small></div><div class="b">plan as flown ${f(x.baseline)}</div><div class="d ${good ? "good" : bad ? "bad" : "flat"}">${x.delta === 0 ? "no change" : (x.delta > 0 ? "▲ " : "▼ ") + (pct ? Math.abs(Math.round(x.delta * 100)) + " pts" : fmt(Math.abs(x.delta), dec))}</div></div>`;
  };
  $("#wiResults").innerHTML = card("bmd", "Hip BMD at mission end", 1) + card("p_bone_10", "P(≥10 % bone loss)", 0, true) + card("muscle", "Leg strength at end", 1) + card("vo2", "VO₂max at end", 1) +
    card("p_sans", "P(ONSD ≥ 6 mm, SANS)", 0, true) + card("dose_pct", "Dose, % career limit", 1) + card("alertness", "Alertness vs rested", 0) + card("pvt", "Reaction time", 0);
  const s = r.series;
  lineChart($("#wiChart"), [
    { name: "Hip BMD — plan as flown", xs: s.t, ys: s.bmd_base, color: "#8fa3b5", dash: "4 4" },
    { name: "Hip BMD — with countermeasures", xs: s.t, ys: s.bmd_new, color: "#5ce1e6" },
  ], { height: 200, yDec: 1, unit: "%", xLabel: t => `+${Math.round(t)} d`, legendRight: true, refs: [{ y: 90, label: "−10 %" }] });
  $("#wiAssump").innerHTML = r.assumptions.map(a => `<li>${esc(a)}</li>`).join("");
}

async function renderEarth() {
  const L = await api("/api/earthlink");
  const ow = L.light.owlt_s, rt = 2 * ow;
  const a = S.raceAlert || S.st.alerts.find(x => x.autonomous) || S.st.alerts[0];
  $("#earthLead").innerHTML = `Today the ${esc(S.st.mission.name)} is <b>${fmtMin(ow / 60)}</b> from Earth at the speed of light (${esc(L.light.method)}). A question and answer takes <b>${fmtMin(rt / 60)}</b> before anyone on the ground has even thought about it.${L.light.blackout ? " <b>Solar conjunction blackout: no link.</b>" : ""}`;
  const fields = [["vitals", "72 h vitals summary", true], ["forecast", "Forecasts and probabilities", true], ["protocol", "Protocol steps taken", true], ["notes", "Crew private notes", false], ["audio", "Voice log", false]];
  $("#packet").innerHTML = a ? `<div class="lbl" style="margin-bottom:6px">Packet · ${esc(a.title)}</div>${fields.map(([k, l, on]) => `<label><input type="checkbox" data-f="${k}" ${on ? "checked" : ""}> ${l}</label>`).join("")}<div class="dim" style="font-size:11px;margin:6px 0 10px">Privacy switch: the crew chooses what leaves the ship.</div><button class="btn primary" id="sendPkt">Transmit to Earth</button>` : `<div class="dim">No alert selected.</div>`;
  if (a) $("#sendPkt").onclick = () => race(a, ow);
  drawOrbit(L);
}
function race(a, ow) {
  clearInterval(S.raceTimer);
  const speed = ow > 120 ? ow / 30 : 1;      // time-warp long delays to 30 s on screen
  const start = performance.now();
  const kb = $$("#packet input:checked").length * 3.2;
  $("#shipLog").innerHTML = ""; $("#track").querySelectorAll(".pkt").forEach(n => n.remove());
  const pkt = document.createElement("div"); pkt.className = "pkt"; pkt.style.left = "0%"; $("#track").appendChild(pkt);
  const log = (t, msg, ok) => { $("#shipLog").insertAdjacentHTML("beforeend", `<li class="${ok ? "ok" : ""}"><span class="t">T+${t}</span>${esc(msg)}</li>`); };
  const proto = S.meta.protocols[a.protocol];
  const steps = proto ? proto.steps.slice(0, 4) : [];
  let shown = 0;
  $("#shipStatus").textContent = "SENTINEL executing onboard protocol";
  $("#earthStatus").textContent = `Packet in flight · ${kb.toFixed(1)} kB · time-warp ×${fmt(speed, 0)}`;
  S.raceTimer = setInterval(() => {
    const el = (performance.now() - start) / 1000 * speed;    // simulated seconds
    $("#shipClock").textContent = mmss(el);
    const due = Math.min(steps.length, Math.floor(el / Math.max(8, ow / 6)) + 1);
    while (shown < due) { log(mmss(shown * Math.max(8, ow / 6)), steps[shown]); shown++; }
    if (shown === steps.length && !S._resolved) { S._resolved = true; log(mmss(el), "Protocol complete — crew stable, monitoring hourly", true); $("#shipStatus").innerHTML = `<span style="color:var(--accent)">Resolved onboard in ${mmss(el)}</span>`; }
    const frac = Math.min(1, el / ow);
    pkt.style.left = (frac * 100) + "%";
    if (el < ow) { $("#earthClock").textContent = "−" + mmss(ow - el); }
    else if (el < ow + 1800) { $("#earthClock").textContent = mmss(el - ow); $("#earthStatus").textContent = "Received. Ground team assessing…"; pkt.style.left = "100%"; }
    if (el >= 2 * ow + 1800) { clearInterval(S.raceTimer); S._resolved = false; $("#earthStatus").innerHTML = `Reply reaches the ship at T+${mmss(2 * ow + 1800)} — <span style="color:var(--accent)">SENTINEL had already acted.</span>`; }
  }, 100);
  S._resolved = false;
}
const mmss = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(x).padStart(2, "0"); };

function drawOrbit(L) {
  const g = L.geometry, svg = $("#orbit");
  const sc = 92, cx = 210, cy = 150;
  const P = ([x, y]) => [cx + x * sc, cy - y * sc];
  const [ex, ey] = P(g.earth_xy), [mx, my] = P(g.mars_xy);
  let ship = "";
  if (L.mission === "mars_transit") { const f = L.transit_fraction; const sx = ex + (mx - ex) * f, sy = ey + (my - ey) * f; ship = `<circle cx="${sx}" cy="${sy}" r="3.5" fill="#5ce1e6"/><text x="${sx + 7}" y="${sy - 6}" fill="#5ce1e6" font-size="10" font-family="Plex Mono">SHIP</text>`; }
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${sc}" fill="none" stroke="#1b2633"/><circle cx="${cx}" cy="${cy}" r="${1.524 * sc}" fill="none" stroke="#1b2633"/>
    <circle cx="${cx}" cy="${cy}" r="7" fill="#e0b25a"/><text x="${cx + 10}" y="${cy + 4}" fill="#8a99a8" font-size="10" font-family="Plex Mono">SUN</text>
    <line x1="${ex}" y1="${ey}" x2="${mx}" y2="${my}" stroke="#5ce1e6" stroke-dasharray="3 4" opacity=".6"/>
    <circle cx="${ex}" cy="${ey}" r="4.5" fill="#3a8de8"/><text x="${ex + 8}" y="${ey + 4}" fill="#9cc6f5" font-size="10" font-family="Plex Mono">EARTH</text>
    <circle cx="${mx}" cy="${my}" r="4" fill="#cf6a4b"/><text x="${mx + 8}" y="${my + 4}" fill="#e7a58f" font-size="10" font-family="Plex Mono">MARS</text>${ship}`;
  $("#orbitNotes").innerHTML = `<div class="stat-row"><span class="k">Earth–Mars distance today</span><span class="v">${fmt(g.distance_au, 3)} AU · ${fmt(g.distance_km / 1e6, 0)} M km</span></div>
    <div class="stat-row"><span class="k">Earth–Mars one-way light time</span><span class="v">${fmtMin(g.owlt_s / 60)}</span></div>
    <div class="stat-row"><span class="k">Sun–Earth–Mars angle</span><span class="v">${fmt(g.elongation_deg, 1)}°</span></div>
    <div class="stat-row"><span class="k">Conjunction blackout</span><span class="v">${g.conjunction_blackout ? "YES" : "no"}</span></div>
    <div class="dim" style="font-size:11px;margin-top:8px">Positions from JPL approximate Keplerian elements (valid 1800–2050). Packets are store-and-forward, as in NASA's delay-tolerant networking.</div>`;
}

async function renderReady() {
  if (!S.detail) return;
  const t = S.detail.task;
  lineChart($("#readyChart"), [
    { name: "Predicted alertness", xs: t.t, ys: t.alertness, color: "#5ce1e6" },
    { name: "Well-rested reference", xs: t.t, ys: t.reference, color: "#8fa3b5", dash: "4 4" },
  ], { height: 230, yDec: 0, unit: "", yMin: 0, yMax: 100, nowX: 0, spans: t.sleep, legendRight: true, xLabel: x => x === 0 ? "now" : `${x > 0 ? "+" : "−"}${Math.abs(Math.round(x))}h`,
    refs: [{ y: t.task_alertness, label: `09:00 task: ${Math.round(t.task_relative)} % of rested`, color: "var(--watch)", textColor: "#f0b660" }] });
  const rows = S.st.crew.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${fmt(c.task.sleep_debt_3n, 1)} h</td><td class="r">${Math.round(c.task.task_relative)} %</td><td>${c.task.task_relative >= 78 ? '<span class="chip nominal">GO</span>' : c.task.task_relative >= 70 ? '<span class="chip watch">GO WITH CAUTION</span>' : '<span class="chip act">NO-GO</span>'}</td></tr>`).join("");
  $("#readyTable").innerHTML = `<table class="data"><thead><tr><th>Crew</th><th class="r">Sleep debt (3 nights)</th><th class="r">Alertness at 09:00</th><th>Task readiness</th></tr></thead><tbody>${rows}</tbody></table><div class="dim" style="font-size:11px;margin-top:8px">Shaded bands: sleep periods from actigraphy (past) and the planned schedule (future).</div>`;
}

async function renderRad() {
  if (!S.crew) return;
  const f = await api(`/api/forecast/${S.crew}/dose?horizon=end`);
  f.threshold = f.threshold || { value: 600, dir: "above", label: "NASA career limit 600 mSv" };
  fanChart($("#doseChart"), f, { height: 240 });
  const sw = await api("/api/spaceweather");
  const sep = (sw.sep || []).slice(0, 6), fl = (sw.flares || []).slice(0, 6);
  $("#swPanel").innerHTML = `<div class="stat-row"><span class="k">Status</span><span class="v">${esc(sw.summary?.label)} ${sw.cached ? "(cached events — live feed unreachable)" : sw.live ? "(live)" : ""}</span></div>
    ${sw.goes ? `<div class="stat-row"><span class="k">GOES ≥10 MeV protons</span><span class="v">${fmt(sw.goes.flux_pfu, 2)} pfu · S${sw.goes.s_scale}</span></div>` : ""}
    <div class="lbl" style="margin:12px 0 4px">Solar energetic particle events (DONKI)</div>
    ${sep.map(e => `<div class="stat-row"><a class="k" href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.time)}</a><span class="v" style="font-size:10.5px">${esc(e.instrument)}</span></div>`).join("") || '<div class="dim">None in the last 30 days.</div>'}
    ${fl.length ? `<div class="lbl" style="margin:12px 0 4px">Recent flares</div>${fl.map(e => `<div class="stat-row"><a class="k" href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.peak)}</a><span class="v">${esc(e.class)}</span></div>`).join("")}` : ""}`;
}

async function renderScore() {
  const v = await api("/api/validation");
  $("#scoreGrid").innerHTML = v.summary.map(s => `<div class="score-card"><div class="lbl">${s.kind === "hourly" ? "Vitals" : "Daily"} · +${s.h} ${s.unit}</div><div class="v" style="color:${s.skill_median > 0.05 ? "var(--accent)" : "var(--ink-2)"}">${s.skill_median >= 0 ? "+" : ""}${Math.round(s.skill_median * 100)}%</div><div class="s">skill vs naive · 80% cov ${Math.round(s.coverage80 * 100)}% · 95% cov ${Math.round(s.coverage95 * 100)}%</div></div>`).join("");
  const name = id => S.st.crew.find(c => c.id === id)?.short || id;
  $("#scoreTable").innerHTML = `<thead><tr><th>Crew</th><th>Signal</th><th class="r">Horizon</th><th class="r">MAE</th><th class="r">Naive MAE</th><th class="r">Skill</th><th class="r">80% cov.</th><th class="r">95% cov.</th><th class="r">Origins</th></tr></thead><tbody>${v.rows.map(r => `<tr><td>${name(r.crew)}</td><td>${esc(S.meta.signals[r.signal]?.label || r.signal)}</td><td class="r">${r.h} ${r.unit}</td><td class="r">${fmt(r.mae, 3)}</td><td class="r">${fmt(r.mae_naive, 3)}</td><td class="r" style="color:${r.skill > 0 ? "var(--accent)" : "var(--ink-3)"}">${r.skill >= 0 ? "+" : ""}${Math.round((r.skill || 0) * 100)}%</td><td class="r">${r.coverage80 != null ? Math.round(r.coverage80 * 100) + "%" : "—"}</td><td class="r">${r.coverage95 != null ? Math.round(r.coverage95 * 100) + "%" : "—"}</td><td class="r">${r.n}</td></tr>`).join("")}</tbody>`;
}

function renderMethods() {
  const src = Object.values(S.meta.sources);
  $("#pane-methods").innerHTML = `<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:32px">
    <div>
      <p class="deck-lead"><b>How SENTINEL thinks.</b></p>
      <ol class="muted" style="font-size:12.5px;line-height:1.65;padding-left:18px;margin:0">
        <li><b style="color:var(--ink)">Digital twin per astronaut.</b> Hourly wearable vitals and daily measures, compared with each person's own baseline, not a population average.</li>
        <li><b style="color:var(--ink)">Vitals forecasting (1 h – 7 d).</b> Seasonal hour-of-day profile over 14 days + linear drift + a persistent residual and damped trend. Intervals are split-conformal from rolling-origin backtests; coverage is reported on held-out origins.</li>
        <li><b style="color:var(--ink)">Slow systems (3 d – mission end).</b> Bayesian linear trend: NASA population rates are the prior on the slope, the astronaut's measurements the likelihood; process noise widens bands with horizon. Horizons beyond the backtestable range are labelled prior-dominated.</li>
        <li><b style="color:var(--ink)">Early warning.</b> Circadian- and sleep-adjusted robust z-scores; a sustained joint rise in temperature and heart rate with falling HRV flags an infection-like pattern.</li>
        <li><b style="color:var(--ink)">Ship vs. body.</b> A deviation shared by most of the crew while cabin CO₂ exceeds NASA's 3 mmHg 1-hour limit is attributed to the ship; one person's deviation with normal cabin air is attributed to the body.</li>
        <li><b style="color:var(--ink)">Readiness.</b> Two-process model of sleep regulation driven by actigraphy sleep history and the planned schedule.</li>
        <li><b style="color:var(--ink)">Autonomy.</b> SENTINEL acts onboard when Earth's answer (round-trip light time + 30 min ground assessment) would arrive after the action deadline, or during conjunction blackout.</li>
        <li><b style="color:var(--ink)">Honesty.</b> Crew data is synthetic, calibrated to NASA-published rates. Effect sizes in the what-if panel are literature-informed estimates; B-Complex and Thigh Cuff effects are hypotheses under test. Decision support, not diagnosis.</li>
      </ol>
    </div>
    <div><p class="deck-lead"><b>NASA data and evidence behind every number.</b></p>
      ${src.map(s => `<div class="stat-row" style="display:block"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.note ? `<div class="dim" style="font-size:11px">${esc(s.note)}</div>` : ""}</div>`).join("")}
    </div></div>`;
}

/* ------------------------------------------------------------------ data */
async function uploadCSV(e) {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append("file", f);
  try {
    const r = await api("/api/ingest", { method: "POST", body: fd });
    $("#ingestReport").textContent = "Mapped columns: " + JSON.stringify(r.report.columns) + "\n" + r.report.groups.map(g => `${g.group} → ${g.mapped_to}: ${g.signals.join(", ")} (${g.rows} rows, ${g.span_hours} h)`).join("\n");
    toast("Data ingested. Re-forecasting."); refresh(true);
  } catch (err) { $("#ingestReport").textContent = "Upload failed: " + err.message; }
  e.target.value = "";
}

async function startSerial() {
  try {
    await connectSerial(v => {
      S.live = { ...(S.live || {}), ...v };
      if (v.hr) holo.setHeartRate(v.hr);
      const vit = $("#whoVitals"); if (vit && S.detail) selectCrewVitalsOnly();
    });
    toast("Sensor connected — the heart now beats at the live pulse.");
  } catch (e) { toast(e.message); }
}
function selectCrewVitalsOnly() {
  const v = S.detail.summary.vitals;
  const cells = $$("#whoVitals > div");
  if (cells[0] && S.live?.hr) cells[0].innerHTML = `<div class="lbl">HR <span style="color:var(--accent)">· live</span></div><div class="v">${fmt(S.live.hr, 0)}<small>bpm</small></div>`;
  if (cells[1] && S.live?.spo2) cells[1].innerHTML = `<div class="lbl">SpO₂ <span style="color:var(--accent)">· live</span></div><div class="v">${fmt(S.live.spo2, 1)}<small>%</small></div>`;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

boot().catch(e => { console.error(e); toast("Startup error: " + e.message); });
