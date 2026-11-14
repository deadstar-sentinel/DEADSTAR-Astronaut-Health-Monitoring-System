// Hand-built SVG charts: fan chart (history + forecast bands), multi-line, sparkline.
// One axis per chart, thin marks, recessive grid, crosshair + tooltip on hover.

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

export function niceTicks(lo, hi, n = 5) {
  if (!isFinite(lo) || !isFinite(hi)) return [];
  if (hi - lo < 1e-9) { hi = lo + 1; lo = lo - 1; }
  const raw = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export function fmt(v, d = 1) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const tip = () => document.getElementById("tip");
function showTip(html, x, y) {
  const t = tip(); if (!t) return;
  t.innerHTML = html; t.style.left = x + "px"; t.style.top = y + "px"; t.style.opacity = 1;
}
function hideTip() { const t = tip(); if (t) t.style.opacity = 0; }

function timeLabel(x, res) {
  if (x === 0) return "now";
  const s = x > 0 ? "+" : "−";
  const a = Math.abs(x);
  if (res === "hour") return a >= 48 && a % 24 === 0 ? `${s}${a / 24}d` : `${s}${a}h`;
  return `${s}${a}d`;
}

/* Fan chart -------------------------------------------------------------- */
export function fanChart(host, d, opt = {}) {
  host.innerHTML = "";
  const W = Math.max(320, host.clientWidth || 600), H = opt.height || 262;
  const m = { l: 46, r: 16, t: 16, b: 26 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img",
    "aria-label": `${d.meta?.label || d.signal} forecast` }, host);
  const dec = d.meta?.decimals ?? 1;
  const unit = d.meta?.unit || "";
  const hist = d.history || [];
  const hx = hist.map((_, i) => d.history_start + i);
  const fx = d.mean.map((_, i) => i + 1);
  const all = [...hist, ...d.lo95, ...d.hi95];
  let lo = Math.min(...all), hi = Math.max(...all);
  const thr = d.threshold;
  if (thr && thr.value > lo - (hi - lo) * 0.6 && thr.value < hi + (hi - lo) * 0.6) { lo = Math.min(lo, thr.value); hi = Math.max(hi, thr.value); }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const x0 = hx.length ? hx[0] : 0, x1 = fx[fx.length - 1];
  const X = x => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

  const g = el("g", { class: "grid" }, svg);
  const ax = el("g", { class: "axis" }, svg);
  for (const t of niceTicks(lo, hi, 4)) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, g);
    const tx = el("text", { x: m.l - 7, y: Y(t) + 3.5, "text-anchor": "end" }, ax); tx.textContent = fmt(t, dec > 1 ? Math.min(dec, 2) : dec);
  }
  // x ticks
  const span = x1 - x0;
  const res = d.resolution;
  let step = res === "hour" ? (span > 240 ? 48 : span > 120 ? 24 : span > 60 ? 12 : 6) : (span > 200 ? 60 : span > 100 ? 30 : span > 50 ? 14 : 7);
  for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) {
    const tx = el("text", { x: X(t), y: H - 8, "text-anchor": "middle" }, ax); tx.textContent = timeLabel(t, res);
  }
  // bands (connect from last history point)
  const lastH = hist.length ? hist[hist.length - 1] : d.mean[0];
  const band = (loA, hiA, cls) => {
    const pts = [[0, lastH], ...fx.map((x, i) => [x, hiA[i]])];
    const back = [...fx.map((x, i) => [x, loA[i]]).reverse(), [0, lastH]];
    el("path", { class: cls, d: "M" + [...pts, ...back].map(([x, v]) => `${X(x).toFixed(1)},${Y(v).toFixed(1)}`).join("L") + "Z" }, svg);
  };
  band(d.lo95, d.hi95, "band95");
  band(d.lo80, d.hi80, "band80");
  // threshold
  if (thr) {
    const tg = el("g", { class: "thr" }, svg);
    el("line", { x1: m.l, x2: W - m.r, y1: Y(thr.value), y2: Y(thr.value) }, tg);
    const t = el("text", { x: W - m.r - 4, y: Y(thr.value) - 5, "text-anchor": "end" }, tg); t.textContent = thr.label;
  }
  // history + forecast
  if (hist.length) el("path", { class: "hist", d: "M" + hist.map((v, i) => `${X(hx[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("L") }, svg);
  el("path", { class: "fcst", d: `M${X(0)},${Y(lastH)}L` + d.mean.map((v, i) => `${X(fx[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("L") }, svg);
  // now
  const ng = el("g", { class: "now" }, svg);
  el("line", { x1: X(0), x2: X(0), y1: m.t - 6, y2: H - m.b }, ng);
  const nt = el("text", { x: X(0) + 5, y: m.t + 2 }, ng); nt.textContent = "NOW";
  const ft = el("text", { x: X(0) + 5, y: m.t + 14, fill: "var(--accent)", style: "font:500 9.5px var(--mono);letter-spacing:.08em" }, svg);
  ft.textContent = "FORECAST →";

  // hover
  const xh = el("g", { class: "xhair", style: "display:none" }, svg);
  const vl = el("line", { y1: m.t, y2: H - m.b }, xh);
  const dot = el("circle", { r: 4 }, xh);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
  const toSvgX = ev => { const r = svg.getBoundingClientRect(); return (ev.clientX - r.left) * (W / r.width); };
  hit.addEventListener("mousemove", ev => {
    const sx = toSvgX(ev);
    const xv = Math.round(x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0));
    let html, v, color;
    if (xv <= 0) {
      const i = xv - d.history_start; if (i < 0 || i >= hist.length) return;
      v = hist[i]; color = "#c9d4de";
      html = `<span class="k">${timeLabel(xv, res)}</span>&nbsp; ${fmt(v, dec)} ${unit}`;
    } else {
      const i = xv - 1; if (i < 0 || i >= d.mean.length) return;
      v = d.mean[i]; color = "var(--accent)";
      html = `<span class="k">${timeLabel(xv, res)}</span>&nbsp; ${fmt(v, dec)} ${unit}<br><span class="k">80%</span> ${fmt(d.lo80[i], dec)} – ${fmt(d.hi80[i], dec)}<br><span class="k">95%</span> ${fmt(d.lo95[i], dec)} – ${fmt(d.hi95[i], dec)}`;
      if (thr && thr.probs) html += `<br><span class="k">P(${thr.dir === "above" ? "≥" : "≤"} ${thr.value})</span> ${Math.round(thr.probs[i] * 100)}%`;
    }
    xh.style.display = ""; vl.setAttribute("x1", X(xv)); vl.setAttribute("x2", X(xv));
    dot.setAttribute("cx", X(xv)); dot.setAttribute("cy", Y(v)); dot.setAttribute("stroke", color);
    const r = svg.getBoundingClientRect();
    showTip(html, r.left + X(xv) * r.width / W + window.scrollX, r.top + Y(v) * r.height / H + window.scrollY);
  });
  hit.addEventListener("mouseleave", () => { xh.style.display = "none"; hideTip(); });
  return svg;
}

/* Multi-line chart ----------------------------------------------------- */
// series: [{name, xs, ys, color, dash, width, band:{lo,hi}}]; opts: {height, xLabel(x), yDec, unit, refs:[{y,label,color}], spans:[[x0,x1]]}
export function lineChart(host, series, o = {}) {
  host.innerHTML = "";
  const W = Math.max(320, host.clientWidth || 600), H = o.height || 230;
  const m = { l: 46, r: o.legendRight ? 120 : 16, t: 14, b: 26 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img", "aria-label": o.label || "chart" }, host);
  const xs = series.flatMap(s => s.xs), ys = series.flatMap(s => [...s.ys, ...(s.band ? [...s.band.lo, ...s.band.hi] : [])]);
  (o.refs || []).forEach(r => { if (o.includeRefs) ys.push(r.y); });
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = o.yMin ?? Math.min(...ys), hi = o.yMax ?? Math.max(...ys);
  const pad = (hi - lo) * 0.08 || 1; if (o.yMin === undefined) lo -= pad; if (o.yMax === undefined) hi += pad;
  const X = x => m.l + (x - x0) / ((x1 - x0) || 1) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - lo) / ((hi - lo) || 1)) * (H - m.t - m.b);
  const g = el("g", { class: "grid" }, svg), ax = el("g", { class: "axis" }, svg);
  for (const t of niceTicks(lo, hi, 4)) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, g);
    el("text", { x: m.l - 7, y: Y(t) + 3.5, "text-anchor": "end" }, ax).textContent = fmt(t, o.yDec ?? 0);
  }
  for (const t of (o.xTicks || niceTicks(x0, x1, 6))) {
    el("text", { x: X(t), y: H - 8, "text-anchor": "middle" }, ax).textContent = o.xLabel ? o.xLabel(t) : t;
  }
  (o.spans || []).forEach(([a, b]) => el("rect", { x: X(Math.max(a, x0)), width: Math.max(0, X(Math.min(b, x1)) - X(Math.max(a, x0))), y: m.t, height: H - m.t - m.b, fill: "rgba(58,141,232,.08)" }, svg));
  (o.refs || []).forEach(r => {
    if (r.y < lo || r.y > hi) return;
    el("line", { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), stroke: r.color || "var(--act)", "stroke-dasharray": "4 3", "stroke-width": 1.2 }, svg);
    el("text", { x: W - m.r - 4, y: Y(r.y) - 5, "text-anchor": "end", fill: r.textColor || "#f19ae0", style: "font:500 10px var(--mono)" }, svg).textContent = r.label;
  });
  if (o.nowX !== undefined) {
    el("line", { x1: X(o.nowX), x2: X(o.nowX), y1: m.t, y2: H - m.b, stroke: "var(--ink-3)", "stroke-dasharray": "2 3" }, svg);
    el("text", { x: X(o.nowX) + 5, y: m.t + 8, fill: "var(--ink-2)", style: "font:600 9.5px var(--mono);letter-spacing:.1em" }, svg).textContent = "NOW";
  }
  for (const s of series) {
    if (s.band) {
      const p = s.xs.map((x, i) => `${X(x)},${Y(s.band.hi[i])}`).concat(s.xs.map((x, i) => `${X(x)},${Y(s.band.lo[i])}`).reverse());
      el("path", { d: "M" + p.join("L") + "Z", fill: s.bandFill || "rgba(92,225,230,.12)" }, svg);
    }
    el("path", { d: "M" + s.xs.map((x, i) => `${X(x).toFixed(1)},${Y(s.ys[i]).toFixed(1)}`).join("L"), fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
  }
  // legend + direct labels (<=4 series)
  if (series.length > 1) {
    series.forEach((s, i) => {
      const lx = o.legendRight ? W - m.r + 12 : m.l + 4 + i * 150, ly = o.legendRight ? m.t + 10 + i * 18 : m.t + 2;
      if (!o.legendRight) return;
      el("line", { x1: lx, x2: lx + 14, y1: ly - 3, y2: ly - 3, stroke: s.color, "stroke-width": 2, "stroke-dasharray": s.dash || "" }, svg);
      el("text", { x: lx + 20, y: ly, fill: "var(--ink-2)", style: "font:11px var(--sans)" }, svg).textContent = s.name;
    });
  }
  // hover
  const xh = el("g", { style: "display:none" }, svg);
  const vl = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-3)" }, xh);
  const dots = series.map(s => el("circle", { r: 3.5, fill: "var(--bg)", stroke: s.color, "stroke-width": 2 }, xh));
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
  hit.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect();
    const sx = (ev.clientX - r.left) * (W / r.width);
    const xv = x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0);
    let html = `<span class="k">${o.xLabel ? o.xLabel(Math.round(xv * 10) / 10) : fmt(xv, 1)}</span>`;
    let yy = null;
    series.forEach((s, j) => {
      let bi = 0, bd = 1e9; s.xs.forEach((x, i) => { const dd = Math.abs(x - xv); if (dd < bd) { bd = dd; bi = i; } });
      dots[j].setAttribute("cx", X(s.xs[bi])); dots[j].setAttribute("cy", Y(s.ys[bi]));
      html += `<br><span style="color:${s.color}">■</span> ${s.name} ${fmt(s.ys[bi], o.yDec ?? 1)}${o.unit ? " " + o.unit : ""}`;
      if (yy === null) yy = Y(s.ys[bi]);
    });
    xh.style.display = ""; vl.setAttribute("x1", sx); vl.setAttribute("x2", sx);
    showTip(html, r.left + sx * r.width / W + window.scrollX, r.top + (yy ?? m.t) * r.height / H + window.scrollY);
  });
  hit.addEventListener("mouseleave", () => { xh.style.display = "none"; hideTip(); });
  return svg;
}

/* Sparkline -------------------------------------------------------------- */
export function sparkline(host, vals, o = {}) {
  host.innerHTML = "";
  const W = 260, H = o.height || 26;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", width: "100%", height: H }, host);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const X = i => i / (vals.length - 1) * W, Y = v => H - 2 - (v - lo) / ((hi - lo) || 1) * (H - 4);
  if (o.fill) el("path", { d: `M0,${H}L` + vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("L") + `L${W},${H}Z`, fill: o.fill }, svg);
  el("path", { d: "M" + vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("L"), fill: "none", stroke: o.color || "#8fa3b5", "stroke-width": o.width || 1.2, "vector-effect": "non-scaling-stroke" }, svg);
  if (o.ref !== undefined && o.ref > lo && o.ref < hi) el("line", { x1: 0, x2: W, y1: Y(o.ref), y2: Y(o.ref), stroke: o.refColor || "var(--watch)", "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }, svg);
  el("circle", { cx: X(vals.length - 1), cy: Y(vals[vals.length - 1]), r: 2, fill: o.color || "#c9d4de" }, svg);
  return svg;
}
