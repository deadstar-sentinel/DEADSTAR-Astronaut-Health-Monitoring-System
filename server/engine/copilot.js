import { HRP_RISKS } from "./constants.js";
import { pctText } from "./analysis.js";

const RISK_NAMES = Object.fromEntries(HRP_RISKS.map((r) => [r.id, r.name]));

function who(q, st) {
  const words = q.split(/\s+/);
  for (const [cid, a] of Object.entries(st.crew)) {
    const parts = a.meta.name.toLowerCase().split(/\s+/);
    if (parts.some((p) => q.includes(p)) || words.includes(a.meta.short.toLowerCase()) || q.includes(cid)) {
      return cid;
    }
  }
  return null;
}

function fmtOwlt(st) {
  const m = st.light.owlt_s / 60;
  return m >= 1 ? `${m.toFixed(1)} minutes` : `${st.light.owlt_s.toFixed(1)} seconds`;
}

export function briefing(st) {
  const lines = [];
  const facts = [];
  const met = st.met().label;
  lines.push(`${st.mission.name}, ${met}. One-way light time to Earth is ${fmtOwlt(st)}.`);
  const acts = st.alerts.filter((a) => a.severity === "act");
  if (!acts.length) {
    lines.push("All crew nominal. No action required.");
  }
  for (const a of acts.slice(0, 3)) {
    const first = a.detail.split(". ")[0].replace(/\.$/, "");
    lines.push(`${a.title}. ${first}.`);
    if (a.autonomous) {
      lines.push(
        `An answer from Earth would take ${a.earth_reply_min.toFixed(0)} minutes, ` +
          `longer than the ${a.act_within_min.toFixed(0)} minutes available, so I have started the onboard protocol.`
      );
    }
    facts.push(a.id);
  }
  if (st.svb.verdict !== "NOMINAL") {
    lines.push(st.svb.headline);
  }
  const watch = st.alerts.filter((a) => a.severity === "watch");
  if (watch.length) {
    lines.push(`${watch.length} items on watch, led by: ${watch[0].title}.`);
  }
  return { text: lines.join(" "), facts };
}

export function rules_answer(q, st, focus = null) {
  const ql = q.toLowerCase();
  const cid = who(ql, st) || focus;
  const an = cid ? st.analyses[cid] : null;
  const name = cid ? st.crew[cid].meta.name : null;

  const ans = (text, facts) => ({ text, facts, engine: "rules", crew: cid });

  if (/\b(eva|task|clear|cleared|ready|readiness|go|burn)\b/.test(ql) && an) {
    const t = an.task;
    const verdict =
      t.task_relative >= 78 && !an.infection_now
        ? "GO"
        : t.task_relative < 70 || an.infection_now
          ? "NO-GO"
          : "GO WITH CAUTION";
    const reason = [];
    if (an.infection_now) reason.push("an active infection-like pattern");
    reason.push(`predicted alertness at the task ${t.task_relative.toFixed(0)} % of a well-rested baseline`);
    reason.push(`sleep debt ${t.sleep_debt_3n.toFixed(1)} hours over three nights`);
    return ans(`${name}: ${verdict} for the 09:00 task — ${reason.join(", ")}.`, [
      "two-process model",
      "actigraphy sleep history",
    ]);
  }

  if (/fever|infect|temperature|sick|ill|virus/.test(ql)) {
    const cid2 =
      cid ||
      Object.keys(st.analyses).reduce((a, b) =>
        st.risks[a].immune.score >= st.risks[b].immune.score ? a : b
      );
    const an2 = st.analyses[cid2];
    const f = an2.hourly_forecast("temp", 24);
    const th = f.threshold;
    const nm = st.crew[cid2].meta.name;
    const lead = an2.detect_hours_ago;
    const curTemp = st.crew[cid2].hourly.temp[st.crew[cid2].hourly.temp.length - 1];
    let txt =
      `${nm}: core temperature now ${curTemp.toFixed(2)} °C. ` +
      `Probability of reaching 38.0 °C in the next 24 hours: ${pctText(th.peak_prob)}, highest in about ${th.peak_in_h} hours. `;
    if (lead !== null) {
      txt += `I first saw the combined temperature, heart-rate and HRV pattern ${lead} hours ago.`;
    }
    return { text: txt, facts: ["hourly forecast", "conformal intervals"], engine: "rules", crew: cid2 };
  }

  if (/bone|fracture|hip/.test(ql)) {
    const cid2 =
      cid ||
      Object.keys(st.analyses).reduce((a, b) =>
        st.risks[a].bone.score >= st.risks[b].bone.score ? a : b
      );
    const r = st.risks[cid2].bone;
    return {
      text: `${st.crew[cid2].meta.name}: ${r.drivers.join("; ")}. ${r.recommendation}.`,
      facts: ["Bayesian trend with NASA 1–1.5 %/month prior"],
      engine: "rules",
      crew: cid2,
    };
  }

  if (/eye|vision|sans|optic/.test(ql)) {
    const cid2 =
      cid ||
      Object.keys(st.analyses).reduce((a, b) =>
        st.risks[a].sans.score >= st.risks[b].sans.score ? a : b
      );
    const r = st.risks[cid2].sans;
    return {
      text: `${st.crew[cid2].meta.name}: ${r.drivers.join("; ")}. ${r.recommendation}.`,
      facts: ["ONSD trend", "SANS risk"],
      engine: "rules",
      crew: cid2,
    };
  }

  if (/radiation|dose|solar|storm|flare|shelter/.test(ql)) {
    const c = st.crew[cid || "haddad"];
    const d = c.daily.dose[c.daily.dose.length - 1];
    const sv = st.svb;
    let txt =
      `Crew dose so far about ${d.toFixed(0)} mSv; chronic rate ${st.mission.dose_msv_day} mSv per day. ` +
      `Current dose rate ${Math.round(sv.rad_now).toLocaleString("en-US")} µSv/h (${sv.rad_ratio.toFixed(1)}× background).`;
    if (sv.rad_ratio > 5) {
      txt += " A solar particle event is in progress: all crew to the storm shelter.";
    }
    return ans(txt, ["dosimetry", "MSL/RAD-calibrated rate"]);
  }

  if (/sleep|tired|fatigue|rest/.test(ql)) {
    const worst =
      cid ||
      Object.keys(st.analyses).reduce((a, b) =>
        st.risks[a].sleep.score >= st.risks[b].sleep.score ? a : b
      );
    const t = st.analyses[worst].task;
    return {
      text:
        `${st.crew[worst].meta.name} has the largest sleep debt: ${t.sleep_debt_3n.toFixed(1)} hours over three nights; ` +
        `predicted alertness at 09:00 is ${t.task_relative.toFixed(0)} % of rested.`,
      facts: ["actigraphy", "two-process model"],
      engine: "rules",
      crew: worst,
    };
  }

  if (/co2|co₂|air|ship|cabin|headache|scrubber/.test(ql)) {
    const sv = st.svb;
    return ans(
      `${sv.headline} Cabin ppCO₂ ${sv.co2_1h.toFixed(2)} mmHg now, 7-day mean ${sv.co2_7d.toFixed(2)} mmHg.`,
      ["cabin sensors", "NASA-STD-3001 CO₂ limits"]
    );
  }

  if (/earth|delay|houston|light|ground/.test(ql)) {
    const rt = (2 * st.light.owlt_s) / 60;
    return ans(
      `One-way light time is ${fmtOwlt(st)}; a question and answer with Houston takes at least ` +
        `${rt.toFixed(0)} minutes plus the time the ground team needs. ${st.light.method}.`,
      ["JPL orbital elements"]
    );
  }

  if (an) {
    const s = st.crew_summary(cid);
    const tops = s.top_risks.map((r) => `${RISK_NAMES[r.id]} ${r.score.toFixed(0)}`).join(", ");
    return ans(`${name}, ${s.role}: health index ${s.health_index.toFixed(0)} of 100. Highest risks: ${tops}.`, [
      "HRP risk model",
    ]);
  }

  const b = briefing(st);
  return { text: b.text, facts: b.facts, engine: "rules", crew: null };
}

export async function llm_answer(q, st, focus) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const snapshot = {
    mission: st.mission.name,
    met: st.met().label,
    one_way_light_time_min: Math.round((st.light.owlt_s / 60) * 100) / 100,
    ship_vs_body: {
      verdict: st.svb.verdict,
      headline: st.svb.headline,
      evidence: st.svb.evidence,
    },
    alerts: st.alerts.map((a) => ({
      title: a.title,
      detail: a.detail,
      severity: a.severity,
      autonomous: a.autonomous,
      earth_reply_min: a.earth_reply_min,
    })),
    crew: Object.keys(st.crew).map((c) => {
      const sum = st.crew_summary(c);
      delete sum.spark;
      return sum;
    }),
  };
  const system =
    "You are LIFELINE, the onboard AI medical officer of a crewed spacecraft. Answer in 2-4 short spoken " +
    "sentences, flight-controller style, using only the numbers in the JSON snapshot. You provide decision " +
    "support, not diagnoses. If the snapshot does not contain the answer, say so.";
  const body = {
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: `Crew state:\n${JSON.stringify(snapshot)}\n\nQuestion: ${q}` }],
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    return { text: text.trim(), facts: ["crew state snapshot"], engine: "claude", crew: focus };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function answer(q, st, focus = null) {
  return (await llm_answer(q, st, focus)) || rules_answer(q, st, focus);
}
