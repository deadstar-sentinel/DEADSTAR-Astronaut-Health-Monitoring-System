"""
The voice medical officer.

Every answer is grounded in the numbers SENTINEL has just computed. If an
ANTHROPIC_API_KEY is configured, Claude phrases the answer from a JSON snapshot
of the crew state; otherwise a deterministic rules engine answers. Either way
the reply lists the facts it used.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request

from .constants import HRP_RISKS
from .crew import CREW

RISK_NAMES = {r["id"]: r["name"] for r in HRP_RISKS}


def _who(q: str, st):
    for cid, a in st.crew.items():
        name = a.meta["name"].lower()
        parts = name.split()
        if any(p in q for p in parts) or a.meta["short"].lower() in q.split() or cid in q:
            return cid
    return None


def _fmt_owlt(st):
    m = st.light["owlt_s"] / 60
    return f"{m:.1f} minutes" if m >= 1 else f"{st.light['owlt_s']:.1f} seconds"


def briefing(st) -> dict:
    lines, facts = [], []
    met = st.met()["label"]
    lines.append(f"{st.mission['name']}, {met}. One-way light time to Earth is {_fmt_owlt(st)}.")
    acts = [a for a in st.alerts if a["severity"] == "act"]
    if not acts:
        lines.append("All crew nominal. No action required.")
    for a in acts[:3]:
        first = a["detail"].split(". ")[0].rstrip(".")
        lines.append(a["title"] + ". " + first + ".")
        if a.get("autonomous"):
            lines.append(f"An answer from Earth would take {a['earth_reply_min']:.0f} minutes, "
                         f"longer than the {a['act_within_min']:.0f} minutes available, so I have started the onboard protocol.")
        facts.append(a["id"])
    if st.svb["verdict"] != "NOMINAL":
        lines.append(st.svb["headline"])
    watch = [a for a in st.alerts if a["severity"] == "watch"]
    if watch:
        lines.append(f"{len(watch)} items on watch, led by: {watch[0]['title']}.")
    return {"text": " ".join(lines), "facts": facts}


def rules_answer(q: str, st, focus: str | None = None) -> dict:
    ql = q.lower()
    cid = _who(ql, st) or focus
    an = st.analyses.get(cid) if cid else None
    name = st.crew[cid].meta["name"] if cid else None

    def ans(text, facts):
        return {"text": text, "facts": facts, "engine": "rules", "crew": cid}

    if re.search(r"\b(eva|task|clear|cleared|ready|readiness|go|burn)\b", ql) and an:
        t = an.task
        verdict = "GO" if t["task_relative"] >= 78 and not an.infection_now else (
            "NO-GO" if t["task_relative"] < 70 or an.infection_now else "GO WITH CAUTION")
        reason = []
        if an.infection_now:
            reason.append("an active infection-like pattern")
        reason.append(f"predicted alertness at the task {t['task_relative']:.0f} % of a well-rested baseline")
        reason.append(f"sleep debt {t['sleep_debt_3n']:.1f} hours over three nights")
        return ans(f"{name}: {verdict} for the 09:00 task — " + ", ".join(reason) + ".",
                   ["two-process model", "actigraphy sleep history"])
    if re.search(r"fever|infect|temperature|sick|ill|virus", ql):
        cid2 = cid or max(st.analyses, key=lambda c: st.risks[c]["immune"]["score"])
        an2 = st.analyses[cid2]
        f = an2.hourly_forecast("temp", 24)
        th = f["threshold"]
        nm = st.crew[cid2].meta["name"]
        lead = an2.detect_hours_ago
        txt = (f"{nm}: core temperature now {st.crew[cid2].hourly['temp'][-1]:.2f} °C. "
               f"Probability of reaching 38.0 °C in the next 24 hours: {th['peak_prob']:.0%}, highest in about {th['peak_in_h']} hours. ")
        if lead is not None:
            txt += f"I first saw the combined temperature, heart-rate and HRV pattern {lead} hours ago."
        return {"text": txt, "facts": ["hourly forecast", "conformal intervals"], "engine": "rules", "crew": cid2}
    if re.search(r"bone|fracture|hip", ql):
        cid2 = cid or max(st.analyses, key=lambda c: st.risks[c]["bone"]["score"])
        r = st.risks[cid2]["bone"]
        return {"text": f"{st.crew[cid2].meta['name']}: " + "; ".join(r["drivers"]) + ". " + r["recommendation"] + ".",
                "facts": ["Bayesian trend with NASA 1–1.5 %/month prior"], "engine": "rules", "crew": cid2}
    if re.search(r"eye|vision|sans|optic", ql):
        cid2 = cid or max(st.analyses, key=lambda c: st.risks[c]["sans"]["score"])
        r = st.risks[cid2]["sans"]
        return {"text": f"{st.crew[cid2].meta['name']}: " + "; ".join(r["drivers"]) + ". " + r["recommendation"] + ".",
                "facts": ["ONSD trend", "SANS risk"], "engine": "rules", "crew": cid2}
    if re.search(r"radiation|dose|solar|storm|flare|shelter", ql):
        d = st.crew[cid or "haddad"].daily["dose"][-1]
        sv = st.svb
        txt = (f"Crew dose so far about {d:.0f} mSv; chronic rate {st.mission['dose_msv_day']} mSv per day. "
               f"Current dose rate {sv['rad_now']:,.0f} µSv/h ({sv['rad_ratio']:.1f}× background).")
        if sv["rad_ratio"] > 5:
            txt += " A solar particle event is in progress: all crew to the storm shelter."
        return ans(txt, ["dosimetry", "MSL/RAD-calibrated rate"])
    if re.search(r"sleep|tired|fatigue|rest", ql):
        worst = cid or max(st.analyses, key=lambda c: st.risks[c]["sleep"]["score"])
        t = st.analyses[worst].task
        return {"text": f"{st.crew[worst].meta['name']} has the largest sleep debt: {t['sleep_debt_3n']:.1f} hours over three nights; "
                        f"predicted alertness at 09:00 is {t['task_relative']:.0f} % of rested.",
                "facts": ["actigraphy", "two-process model"], "engine": "rules", "crew": worst}
    if re.search(r"co2|co₂|air|ship|cabin|headache|scrubber", ql):
        sv = st.svb
        return ans(f"{sv['headline']} Cabin ppCO₂ {sv['co2_1h']:.2f} mmHg now, 7-day mean {sv['co2_7d']:.2f} mmHg.",
                   ["cabin sensors", "NASA-STD-3001 CO₂ limits"])
    if re.search(r"earth|delay|houston|light|ground", ql):
        rt = 2 * st.light["owlt_s"] / 60
        return ans(f"One-way light time is {_fmt_owlt(st)}; a question and answer with Houston takes at least "
                   f"{rt:.0f} minutes plus the time the ground team needs. {st.light['method']}.",
                   ["JPL orbital elements"])
    if an:
        s = st.crew_summary(cid)
        tops = ", ".join(f"{RISK_NAMES[r['id']]} {r['score']:.0f}" for r in s["top_risks"])
        return ans(f"{name}, {s['role']}: health index {s['health_index']:.0f} of 100. Highest risks: {tops}.",
                   ["HRP risk model"])
    b = briefing(st)
    return {"text": b["text"], "facts": b["facts"], "engine": "rules", "crew": None}


def llm_answer(q: str, st, focus: str | None):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    snapshot = {
        "mission": st.mission["name"], "met": st.met()["label"],
        "one_way_light_time_min": round(st.light["owlt_s"] / 60, 2),
        "ship_vs_body": {k: st.svb[k] for k in ("verdict", "headline", "evidence")},
        "alerts": [{k: a.get(k) for k in ("title", "detail", "severity", "autonomous", "earth_reply_min")} for a in st.alerts],
        "crew": [st.crew_summary(c) for c in st.crew],
    }
    for c in snapshot["crew"]:
        c.pop("spark", None)
    system = ("You are SENTINEL, the onboard AI medical officer of a crewed spacecraft. Answer in 2-4 short spoken "
              "sentences, flight-controller style, using only the numbers in the JSON snapshot. You provide decision "
              "support, not diagnoses. If the snapshot does not contain the answer, say so.")
    body = {
        "model": os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5"),
        "max_tokens": 300,
        "system": system,
        "messages": [{"role": "user", "content": f"Crew state:\n{json.dumps(snapshot)}\n\nQuestion: {q}"}],
    }
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read().decode())
        text = "".join(b.get("text", "") for b in data.get("content", []))
        return {"text": text.strip(), "facts": ["crew state snapshot"], "engine": "claude", "crew": focus}
    except Exception:  # noqa: BLE001
        return None


def answer(q: str, st, focus: str | None = None) -> dict:
    return llm_answer(q, st, focus) or rules_answer(q, st, focus)
