export const FIT_DAYS = 21;
export const HARMONICS = 3;
export const Z80 = 1.2816;
export const Z95 = 1.96;

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const y =
    1.0 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return sign * y;
}

export function norm_cdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function median(arr) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

export function std(arr) {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / arr.length);
}

export function quantile(arr, p) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function pd_ewma(v, alpha) {
  const out = new Float64Array(v.length);
  let ew = 0.0;
  for (let i = 0; i < v.length; i++) {
    ew = alpha * v[i] + (1 - alpha) * ew;
    out[i] = ew;
  }
  return out;
}

export class HourlyModel {
  constructor(y, end = null, fitDays = 14) {
    end = end === null ? y.length : end;
    const start = Math.max(0, end - fitDays * 24);
    this.end = end;
    const n = end - start;
    const prof = new Float64Array(24);
    const counts = new Int32Array(24);
    let yMean = 0;
    for (let k = 0; k < n; k++) {
      const t = start + k;
      const v = y[t];
      const h = t % 24;
      prof[h] += v;
      counts[h] += 1;
      yMean += v;
    }
    yMean /= n || 1;
    for (let h = 0; h < 24; h++) {
      prof[h] = counts[h] > 0 ? prof[h] / counts[h] : yMean;
    }

    const r = new Float64Array(n);
    const x = new Float64Array(n);
    let xm = 0;
    let rm = 0;
    for (let k = 0; k < n; k++) {
      const t = start + k;
      x[k] = t - end;
      r[k] = y[t] - prof[t % 24];
      xm += x[k];
      rm += r[k];
    }
    xm /= n || 1;
    rm /= n || 1;

    let num = 0;
    let den = 0;
    for (let k = 0; k < n; k++) {
      const dx = x[k] - xm;
      num += dx * (r[k] - rm);
      den += dx * dx;
    }
    const b = num / (den || 1);
    const a = rm - b * xm;

    const prof2 = new Float64Array(24);
    for (let k = 0; k < n; k++) {
      const t = start + k;
      prof2[t % 24] += y[t] - (a + b * x[k]);
    }
    for (let h = 0; h < 24; h++) {
      prof2[h] = counts[h] > 0 ? prof2[h] / counts[h] : 0.0;
    }

    this.prof = prof2;
    this.a = a;
    this.b = b;

    const res = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const t = start + k;
      res[k] = y[t] - prof2[t % 24] - (a + b * x[k]);
    }
    this.sigma = std(res) || 1e-6;

    const alpha = 2 / (12 + 1);
    const ewArr = pd_ewma(res, alpha);
    this.slow = ewArr.length ? ewArr[ewArr.length - 1] : 0;

    const fast = new Float64Array(n);
    for (let k = 0; k < n; k++) fast[k] = res[k] - ewArr[k];
    let fNum = 0;
    let fDen = 0;
    for (let k = 0; k < n - 1; k++) {
      fNum += fast[k] * fast[k + 1];
      fDen += fast[k] * fast[k];
    }
    this.phi = Math.max(0.0, Math.min(0.95, fNum / (fDen || 1e-9)));
    this.fast = fast.length ? fast[fast.length - 1] : 0;

    const recStart = Math.max(0, n - 24);
    const recent = res.subarray(recStart);
    const rn = recent.length;
    const xrMean = (rn - 1) / 2;
    const sm = pd_ewma(recent, 2 / (6 + 1));
    const smMean = mean(sm);
    let sNum = 0;
    let sDen = 0;
    for (let k = 0; k < rn; k++) {
      const dx = k - xrMean;
      sNum += dx * (sm[k] - smMean);
      sDen += dx * dx;
    }
    const slope = sNum / (sDen || 1);
    const resid2 = new Float64Array(rn);
    for (let k = 0; k < rn; k++) {
      resid2[k] = sm[k] - smMean - slope * (k - xrMean);
    }
    const se = std(resid2) / (Math.sqrt(sDen) || 1);
    this.slope = Math.abs(slope) > 3.0 * se && Math.abs(slope) * 24 > 0.5 * this.sigma ? slope : 0.0;
    this.rho = 0.99;
    this.psi = 0.97;
  }

  predict(horizon) {
    const out = new Float64Array(horizon);
    for (let i = 0; i < horizon; i++) {
      const h = i + 1;
      const tt = this.end - 1 + h;
      const base = this.prof[Math.trunc(tt) % 24] + this.a + this.b * (tt - this.end);
      const resid = this.slow * Math.pow(this.rho, h) + this.fast * Math.pow(this.phi, h);
      const trend = (this.slope * this.psi * (1 - Math.pow(this.psi, h))) / (1 - this.psi);
      out[i] = base + resid + trend;
    }
    return out;
  }
}

export function backtest_hourly(y, maxH = 168, step = 6, spanDays = 14) {
  const n = y.length;
  const first = Math.max(14 * 24, n - maxH - spanDays * 24);
  const origins = [];
  for (let o = first; o <= n - maxH; o += step) origins.push(o);
  if (origins.length < 6) return null;

  const errs = [];
  const naive = [];
  for (let j = 0; j < origins.length; j++) {
    const o = origins[j];
    const m = new HourlyModel(y, o);
    const f = m.predict(maxH);
    const ej = new Float64Array(maxH);
    const nj = new Float64Array(maxH);
    for (let i = 0; i < maxH; i++) {
      const truth = y[o + i];
      ej[i] = truth - f[i];
      nj[i] = truth - y[o - 24 + (i % 24)];
    }
    errs.push(ej);
    naive.push(nj);
  }
  return { origins, errors: errs, naive };
}

export function conformal_from_backtest(bt, maxH) {
  const k = bt.errors.length;
  const split = Math.max(3, Math.floor(k * 0.6));
  const absE = bt.errors.map((row) => row.map((v) => Math.abs(v)));

  const colQuantiles = (rows, p) => {
    const out = new Float64Array(maxH);
    const col = new Float64Array(rows.length);
    let runMax = 0;
    for (let h = 0; h < maxH; h++) {
      for (let r = 0; r < rows.length; r++) col[r] = rows[r][h];
      const qv = quantile(col, p);
      if (qv > runMax) runMax = qv;
      out[h] = runMax;
    }
    return out;
  };

  const cal = absE.slice(0, split);
  const ev = absE.slice(split);
  const q80_cal = colQuantiles(cal, 0.8);
  const q95_cal = colQuantiles(cal, 0.95);

  let cov80 = null;
  let cov95 = null;
  if (ev.length) {
    let c80 = 0;
    let c95 = 0;
    const total = ev.length * maxH;
    for (let r = 0; r < ev.length; r++) {
      for (let h = 0; h < maxH; h++) {
        if (ev[r][h] <= q80_cal[h]) c80++;
        if (ev[r][h] <= q95_cal[h]) c95++;
      }
    }
    cov80 = c80 / total;
    cov95 = c95 / total;
  }

  const q80 = colQuantiles(absE, 0.8);
  const q95 = colQuantiles(absE, 0.95);
  const mae = new Float64Array(maxH);
  const mae_naive = new Float64Array(maxH);
  for (let h = 0; h < maxH; h++) {
    let se = 0;
    let sn = 0;
    for (let r = 0; r < k; r++) {
      se += absE[r][h];
      sn += Math.abs(bt.naive[r][h]);
    }
    mae[h] = se / k;
    mae_naive[h] = sn / k;
  }

  return { q80, q95, mae, mae_naive, coverage80: cov80, coverage95: cov95, n_origins: k, n_eval: ev.length };
}

export function horizon_summary(cal, hours) {
  const out = [];
  for (const h of hours) {
    const i = Math.min(h, cal.mae.length) - 1;
    let sMae = 0;
    let sNaive = 0;
    for (let j = 0; j <= i; j++) {
      sMae += cal.mae[j];
      sNaive += cal.mae_naive[j];
    }
    const mae = sMae / (i + 1);
    const naive = sNaive / (i + 1);
    out.push({
      h,
      mae,
      mae_naive: naive,
      skill: naive > 0 ? 1 - mae / naive : null,
      q80: cal.q80[i],
      q95: cal.q95[i],
    });
  }
  return out;
}

export function exceed_prob(mu, q80, thr, direction) {
  const sigma = Math.max(q80 / Z80, 1e-6);
  const z = (thr - mu) / sigma;
  const pAbove = 1 - norm_cdf(z);
  return direction === "above" ? pAbove : 1 - pAbove;
}

export function bayes_trend(y, priorSlope, priorSd, window = 60, end = null, processQ = null) {
  end = end === null ? y.length : end;
  const start = Math.max(0, end - window);
  const yy = y.slice(start, end);
  const n = yy.length;

  let sigma = 1.0;
  if (n > 3) {
    const d = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) d[i] = yy[i + 1] - yy[i];
    const medD = median(d);
    const absD = d.map((v) => Math.abs(v - medD));
    sigma = (1.4826 * median(absD)) / Math.SQRT2;
  }
  sigma = Math.max(sigma, 1e-4);

  const last5 = yy.slice(-5);
  const priorMean0 = mean(last5);
  const priorMean1 = priorSlope;

  const yyMean = mean(yy);
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dv = yy[i] - yyMean;
    varY += dv * dv;
  }
  varY /= n || 1;

  const pCov0 = Math.max(varY, sigma * sigma) * 100 + 1e-6;
  const pCov1 = priorSd * priorSd;
  const P0_00 = 1 / pCov0;
  const P0_11 = 1 / pCov1;

  let sx = 0;
  let sxx = 0;
  let sy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const xi = i - (n - 1);
    const yi = yy[i];
    sx += xi;
    sxx += xi * xi;
    sy += yi;
    sxy += xi * yi;
  }
  const invSig2 = 1 / (sigma * sigma);
  const Pn00 = P0_00 + n * invSig2;
  const Pn01 = sx * invSig2;
  const Pn11 = P0_11 + sxx * invSig2;
  const det = Pn00 * Pn11 - Pn01 * Pn01;
  const cov00 = Pn11 / det;
  const cov01 = -Pn01 / det;
  const cov11 = Pn00 / det;

  const rhs0 = P0_00 * priorMean0 + sy * invSig2;
  const rhs1 = P0_11 * priorMean1 + sxy * invSig2;
  const mean0 = cov00 * rhs0 + cov01 * rhs1;
  const mean1 = cov01 * rhs0 + cov11 * rhs1;

  if (processQ === null) processQ = Math.pow(0.15 * sigma, 2);

  return {
    mean: [mean0, mean1],
    cov: [
      [cov00, cov01],
      [cov01, cov11],
    ],
    sigma,
    q: processQ,
    n,
    prior_slope: priorSlope,
    prior_sd: priorSd,
  };
}

export function bayes_predict(fit, horizonDays) {
  const mu = new Float64Array(horizonDays);
  const sd = new Float64Array(horizonDays);
  const m0 = fit.mean[0];
  const m1 = fit.mean[1];
  const c00 = fit.cov[0][0];
  const c01 = fit.cov[0][1];
  const c11 = fit.cov[1][1];
  const s2 = fit.sigma * fit.sigma;
  const q = fit.q;

  for (let i = 0; i < horizonDays; i++) {
    const h = i + 1;
    mu[i] = m0 + m1 * h;
    const xCx = c00 + 2 * c01 * h + c11 * h * h;
    sd[i] = Math.sqrt(Math.max(0, s2 + xCx + q * h));
  }
  return { mu, sd };
}

export function backtest_daily(y, priorSlope, priorSd, window, horizons = [3, 7, 14, 30], minHist = 30, step = 3, q = null) {
  const out = {};
  const n = y.length;
  for (const H of horizons) {
    const origins = [];
    for (let o = minHist; o <= n - H; o += step) origins.push(o);
    if (origins.length < 5) {
      out[H] = null;
      continue;
    }
    let errs = 0;
    let cov80 = 0;
    let cov95 = 0;
    let naive = 0;
    for (const o of origins) {
      const fit = bayes_trend(y, priorSlope, priorSd, window, o, q);
      const { mu, sd } = bayes_predict(fit, H);
      const e = y[o + H - 1] - mu[mu.length - 1];
      const ae = Math.abs(e);
      errs += ae;
      if (ae <= Z80 * sd[sd.length - 1]) cov80++;
      if (ae <= Z95 * sd[sd.length - 1]) cov95++;
      naive += Math.abs(y[o + H - 1] - y[o - 1]);
    }
    const mae = errs / origins.length;
    const mn = naive / origins.length;
    out[H] = {
      mae,
      mae_naive: mn,
      skill: mn > 0 ? 1 - mae / mn : null,
      coverage80: cov80 / origins.length,
      coverage95: cov95 / origins.length,
      n: origins.length,
    };
  }
  return out;
}
