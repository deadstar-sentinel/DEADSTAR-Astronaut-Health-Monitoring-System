import { AU_KM, SPEED_OF_LIGHT_KM_S } from "./constants.js";

const ELEMENTS = {
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function helio(planet, when) {
  const jd = when.getTime() / 86400000.0 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  const [el0, rate] = ELEMENTS[planet];
  const a = el0[0] + rate[0] * T;
  const e = el0[1] + rate[1] * T;
  const Ideg = el0[2] + rate[2] * T;
  const L = el0[3] + rate[3] * T;
  const wbar = el0[4] + rate[4] * T;
  const Omdeg = el0[5] + rate[5] * T;
  const wdeg = wbar - Omdeg;
  const M = (((L - wbar + 180) % 360) + 360) % 360 - 180;
  const Mr = rad(M);
  let E = Mr + e * Math.sin(Mr);
  for (let i = 0; i < 12; i++) {
    E -= (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = rad(wdeg);
  const Om = rad(Omdeg);
  const I = rad(Ideg);
  const x =
    (Math.cos(w) * Math.cos(Om) - Math.sin(w) * Math.sin(Om) * Math.cos(I)) * xp +
    (-Math.sin(w) * Math.cos(Om) - Math.cos(w) * Math.sin(Om) * Math.cos(I)) * yp;
  const y =
    (Math.cos(w) * Math.sin(Om) + Math.sin(w) * Math.cos(Om) * Math.cos(I)) * xp +
    (-Math.sin(w) * Math.sin(Om) + Math.cos(w) * Math.cos(Om) * Math.cos(I)) * yp;
  const z = Math.sin(w) * Math.sin(I) * xp + Math.cos(w) * Math.sin(I) * yp;
  return [x, y, z];
}

export function earth_mars(when = new Date()) {
  const [ex, ey, ez] = helio("earth", when);
  const [mx, my, mz] = helio("mars", when);
  const dx = mx - ex;
  const dy = my - ey;
  const dz = mz - ez;
  const d_au = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const dot = -ex * dx - ey * dy - ez * dz;
  const e_mag = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const cosElong = Math.max(-1, Math.min(1, dot / (e_mag * d_au)));
  const elong = deg(Math.acos(cosElong));
  const owlt = (d_au * AU_KM) / SPEED_OF_LIGHT_KM_S;
  return {
    distance_au: d_au,
    distance_km: d_au * AU_KM,
    owlt_s: owlt,
    elongation_deg: elong,
    conjunction_blackout: elong < 3.0,
    earth_xy: [ex, ey],
    mars_xy: [mx, my],
  };
}

export function light_time(mission, when = new Date()) {
  const kind = mission.light_time;
  if (kind === "leo") {
    return { owlt_s: 0.12, method: "LEO via relay satellites (sub-second)", blackout: false };
  }
  if (kind === "moon") {
    return { owlt_s: 1.28, method: "Earth–Moon mean distance", blackout: false };
  }
  const em = earth_mars(when);
  let owlt, method;
  if (mission.id === "mars_transit") {
    const f = mission.current_day / mission.duration_days;
    owlt = em.owlt_s * f;
    method = `Today's Earth–Mars distance (JPL elements) × transit fraction ${f.toFixed(2)}`;
  } else {
    owlt = em.owlt_s;
    method = "Today's Earth–Mars distance from JPL Keplerian elements";
  }
  return {
    owlt_s: owlt,
    method,
    blackout: em.conjunction_blackout,
    earth_mars_owlt_s: em.owlt_s,
    distance_au: em.distance_au,
    elongation_deg: em.elongation_deg,
  };
}
