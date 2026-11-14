import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronDown, Play, Square } from "lucide-react";
import { EARTH_X, ParticleStage, SHIP_X, type StageRig } from "./ParticleStage.tsx";

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ live numbers (fallbacks = today's values) */
interface Story {
  owltMin: number;        // crew -> Earth one-way light time today
  actMin: number;         // alert: act within
  earthMin: number;       // alert: Earth reply (round trip + ground response)
  feverPct: number;       // alert: P(fever within 24 h)
  crewName: string;
  day: number;
  duration: number;
  risks: number;
  signals: number;
  sources: number;
  cover80: number;        // back-test: share of outcomes inside the 80 % band
}
const FALLBACK: Story = { owltMin: 7.8, actMin: 45, earthMin: 45.7, feverPct: 56, crewName: "Kenji Mori", day: 150, duration: 210, risks: 17, signals: 20, sources: 12, cover80: 80 };

function useStory(): Story | null {
  const [s, setS] = useState<Story | null>(null);
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => alive && setS((v) => v ?? FALLBACK), 2500);
    Promise.all([fetch("/api/state?mission=mars_transit").then((r) => r.json()), fetch("/api/meta").then((r) => r.json())])
      .then(([st, meta]) => {
        if (!alive) return;
        const al = (st.alerts || []).find((a: { severity: string; act_within_min?: number }) => a.severity === "act" && a.act_within_min != null && a.act_within_min < 120);
        const crew = al ? (st.crew || []).find((c: { id: string }) => c.id === al.crew) : null;
        setS((prev) => ({
          owltMin: st.light?.owlt_s ? st.light.owlt_s / 60 : FALLBACK.owltMin,
          actMin: al?.act_within_min ?? FALLBACK.actMin,
          earthMin: al?.earth_reply_min ?? FALLBACK.earthMin,
          feverPct: al?.fever_prob_24h != null ? Math.round(al.fever_prob_24h * 100) : FALLBACK.feverPct,
          crewName: crew?.name ?? FALLBACK.crewName,
          day: st.mission?.current_day ?? FALLBACK.day,
          duration: st.mission?.duration_days ?? FALLBACK.duration,
          risks: meta?.risks?.length ?? FALLBACK.risks,
          signals: meta?.signals ? Object.keys(meta.signals).length : FALLBACK.signals,
          sources: meta?.sources ? Object.keys(meta.sources).length : FALLBACK.sources,
          cover80: prev?.cover80 ?? FALLBACK.cover80,
        }));
      })
      .catch(() => alive && setS((v) => v ?? FALLBACK));
    fetch("/api/validation?mission=mars_transit")
      .then((r) => r.json())
      .then((val) => {
        const row = val?.summary?.find((r: { kind: string; h: number }) => r.kind === "hourly" && r.h === 24);
        if (alive && row?.coverage80 != null) setS((v) => ({ ...(v ?? FALLBACK), cover80: Math.round(row.coverage80 * 100) }));
      })
      .catch(() => {});
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);
  return s;
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <div className="text-[11px] font-mono uppercase tracking-[0.32em] text-cyan-300/90">{children}</div>
);

/** A story beat laid over the 3D stage. `side` says where its text sits; the subject takes the other side. */
function Scene({ i, side, children }: { i: number; side: "left" | "right" | "center"; children: ReactNode }) {
  const align = side === "left" ? "lg:justify-start" : side === "right" ? "lg:justify-end" : "lg:justify-center";
  return (
    <section className={`sc sc-${i} absolute inset-0 flex items-end lg:items-center justify-center ${align} px-6 lg:px-[7vw] ${side === "right" ? "lg:pr-[12vw]" : ""} pb-20 lg:pb-0`} style={i > 0 ? { visibility: "hidden", opacity: 0 } : undefined}>
      <div className={`w-full ${side === "center" ? "max-w-3xl text-center" : i === 0 ? "lg:max-w-[56vw]" : "max-w-xl"} rounded-sm bg-[#02060f]/70 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-0 p-4 lg:p-0`}>{children}</div>
    </section>
  );
}

const DUR = 5.6;                                   // master timeline length (one unit = one scene)
const STOPS = [0, 1.36, 2.42, 3.42, 4.42, 5.4];     // where each scene rests
const NAMES = ["Sentinel", "The distance", "The decision", "The twin", "The proof", "Enter"];

/* ------------------------------------------------------------------ landing */
export function Landing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const story = useStory();
  const s = story ?? FALLBACK;
  const live = useRef(s);
  live.current = s;
  const [active, setActive] = useState(0);
  const [film, setFilm] = useState(false);
  const left = useRef(false);
  const rig = useMemo<StageRig>(
    () => ({ m: 0, form: 0, burst: 0, x: 0.9, rotY: -0.35, camZ: 4.7, organs: 0.55, alert: 0, photon: 0, photonA: 0, bright: 1, scrollV: 0 }),
    [],
  );
  const max = Math.max(s.actMin, s.earthMin) * 1.08;
  // where Earth and the ship land on screen in the distance scene (same maths as the stage camera)
  const [geo, setGeo] = useState({ earthX: 19, earthY: 70, shipX: 81, shipY: 59 });
  useEffect(() => {
    const place = () => {
      const aspect = window.innerWidth / window.innerHeight;
      const fit = aspect < 1.25 ? 1 + (1.25 - aspect) * 1.6 : 1;
      const halfH = 7.4 * fit * Math.tan((34 * Math.PI) / 360);
      const halfW = halfH * aspect;
      const fx = (x: number) => 50 + (x / (2 * halfW)) * 100;
      setGeo({ earthX: fx(EARTH_X), earthY: 50 + (0.78 / (2 * halfH)) * 100 + 4, shipX: fx(SHIP_X), shipY: 50 + (0.2 / (2 * halfH)) * 100 + 4 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  const leave = () => {
    if (left.current) return;
    left.current = true;
    const sc = scroller.current;
    if (sc) gsap.killTweensOf(sc);
    gsap.to(rig, { burst: 1, bright: 2.2, duration: 0.85, ease: "power2.in" });
    if (root.current) gsap.to(root.current, { opacity: 0, duration: 0.5, delay: 0.5, ease: "power1.in" });
    window.setTimeout(onEnter, 1050); // timer, not an animation callback: entering can never stall
  };

  const goTo = (i: number, dur = 1.5) => {
    const sc = scroller.current;
    if (!sc) return;
    const top = (STOPS[Math.max(0, Math.min(STOPS.length - 1, i))] / DUR) * (sc.scrollHeight - sc.clientHeight);
    gsap.to(sc, { scrollTop: top, duration: dur, ease: "power2.inOut", overwrite: true });
  };
  const nearest = () => {
    const t = tlRef.current?.time() ?? 0;
    let best = 0;
    STOPS.forEach((st, i) => {
      if (Math.abs(st - t) < Math.abs(STOPS[best] - t)) best = i;
    });
    return best;
  };

  // Stardust gathers into the body as soon as the model is in.
  const formed = useRef(false);
  const onReady = () => {
    if (formed.current) return;
    formed.current = true;
    gsap.to(rig, { form: 1, duration: 3.4, ease: "power2.inOut" });
  };

  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !root.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let feverDone = false;
    let proofDone = false;
    const q = (sel: string) => root.current?.querySelector<HTMLElement>(sel) ?? null;
    const count = (sel: string, to: number, suffix = "") => {
      const el = q(sel);
      if (!el) return;
      const o = { v: 0 };
      gsap.to(o, { v: to, duration: 1.5, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.v) + suffix; } });
      window.setTimeout(() => { el.textContent = Math.round(to) + suffix; }, 1900);
    };
    const ctx = gsap.context(() => {
      // hero entrance (plays on load; not tied to scroll)
      if (!reduce) {
        gsap.from(".ch", { yPercent: 115, opacity: 0, filter: "blur(16px)", duration: 1.4, stagger: 0.07, ease: "expo.out", delay: 0.25 });
        gsap.from(".hero-sub", { y: 26, opacity: 0, duration: 1.1, stagger: 0.14, delay: 1.0, ease: "power3.out" });
      }
      gsap.to(".cta-ring", { scale: 1.6, opacity: 0, duration: 1.9, repeat: -1, ease: "power2.out" });
      gsap.to(".hint-chev", { y: 7, duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" });

      const clock = q(".dist-clock");
      const leg = q(".dist-leg");
      const prog = q(".prog");
      const sync = () => {
        const tl = tlRef.current;
        if (!tl) return;
        const t = tl.time();
        const owlt = live.current.owltMin;
        // the signal: ship -> Earth -> ship, clock in step with it
        const f1 = gsap.utils.clamp(0, 1, (t - 1.14) / 0.2);
        const f2 = gsap.utils.clamp(0, 1, (t - 1.4) / 0.2);
        rig.photon = t < 1.4 ? f1 : 1 - f2;
        rig.photonA = t > 1.08 && t < 1.7 ? 1 : 0;
        if (clock && leg) {
          clock.textContent = (owlt * (f1 + f2)).toFixed(1);
          leg.textContent = f1 < 1 ? "Crew → Earth" : f2 <= 0 ? "Reached Earth" : f2 < 1 ? "Earth → Crew" : "Round trip · before anyone has replied";
        }
        if (prog) prog.style.transform = `scaleX(${tl.progress()})`;
        if (t > 2.12 && !feverDone) {
          feverDone = true;
          count(".fever-n", live.current.feverPct, "%");
        }
        if (t > 4.08 && !proofDone) {
          proofDone = true;
          const v = live.current;
          count(".n-risks", v.risks);
          count(".n-sig", v.signals);
          count(".n-cov", v.cover80, "%");
          count(".n-src", v.sources);
        }
        let best = 0;
        STOPS.forEach((st, i) => {
          if (t >= st - 0.3) best = i;
        });
        setActive(best);
      };

      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onUpdate: sync,
        scrollTrigger: { scroller: sc, start: 0, end: "max", scrub: 1.1 },
      });
      tlRef.current = tl;
      const morph = (to: number, at: number, vars: gsap.TweenVars) => {
        tl.to(rig, { m: to, duration: 0.38, ease: "power2.inOut" }, at);
        tl.to(rig, { ...vars, duration: 0.38, ease: "power2.inOut" }, at);
      };
      const scene = (i: number) => {
        if (i > 0) tl.fromTo(`.sc-${i}`, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, duration: 0.24 }, i - 0.14);
        if (i < 5) tl.to(`.sc-${i}`, { autoAlpha: 0, y: -60, duration: 0.2, ease: "power2.in" }, i + 0.72);
      };
      // 0 hero -> 1 distance
      scene(0);
      tl.to(".hint", { autoAlpha: 0, duration: 0.1 }, 0.05);
      morph(1, 0.7, { x: 0, rotY: 0, camZ: 7.4, organs: 0.5 });
      scene(1);
      tl.from(".sc-1 .rv", { y: 24, opacity: 0, stagger: 0.04, duration: 0.16 }, 0.92);
      tl.fromTo(".dist-punch", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.1 }, 1.6);
      // 1 -> 2 decision
      morph(2, 1.7, { x: -0.95, rotY: 0.4, camZ: 4.7, alert: 1 });
      scene(2);
      tl.from(".sc-2 .rv", { y: 24, opacity: 0, stagger: 0.04, duration: 0.16 }, 1.92);
      tl.fromTo(".bar-act", { scaleX: 0 }, { scaleX: 1, duration: 0.2 }, 2.12);
      tl.fromTo(".bar-earth", { scaleX: 0 }, { scaleX: 1, duration: 0.2 }, 2.18);
      tl.fromTo(".verdict", { scale: 2.3, autoAlpha: 0, filter: "blur(12px)" }, { scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: 0.12, ease: "back.out(2.2)" }, 2.42);
      tl.fromTo(".verdict-note", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.1 }, 2.54);
      // 2 -> 3 twin
      morph(3, 2.7, { x: 0.95, rotY: -0.5, alert: 0, organs: 1.05, camZ: 4.3 });
      scene(3);
      tl.from(".sc-3 .rv", { y: 24, opacity: 0, stagger: 0.05, duration: 0.16 }, 2.92);
      tl.from(".co", { x: -22, opacity: 0, stagger: 0.07, duration: 0.14 }, 3.14);
      // 3 -> 4 proof
      morph(4, 3.7, { x: -1.1, rotY: 0, organs: 0.6, camZ: 4.9 });
      scene(4);
      tl.from(".sc-4 .rv", { y: 24, opacity: 0, stagger: 0.05, duration: 0.16 }, 3.92);
      tl.from(".stat", { y: 40, opacity: 0, rotateX: -20, stagger: 0.05, duration: 0.18 }, 4.0);
      // 4 -> 5 enter
      morph(5, 4.7, { x: 0.95, rotY: -0.3, camZ: 4.5, organs: 0.75, bright: 1.05 });
      scene(5);
      tl.from(".sc-5 .rv", { y: 24, opacity: 0, stagger: 0.06, duration: 0.18 }, 4.94);
      tl.to({}, { duration: 0.01 }, DUR - 0.01);
      sync();
    }, root);

    // scroll speed feeds the star warp; any manual input stops the film
    let last = sc.scrollTop;
    const onScroll = () => {
      rig.scrollV = Math.max(rig.scrollV, Math.min(4, Math.abs(sc.scrollTop - last) / 30));
      last = sc.scrollTop;
    };
    const stopFilm = () => {
      gsap.killTweensOf(sc);
      setFilm(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " ", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        setFilm(false);
        const n = nearest();
        if (n >= STOPS.length - 1) leave();
        else goTo(n + 1);
      } else if (["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key)) {
        e.preventDefault();
        setFilm(false);
        goTo(nearest() - 1);
      } else if (e.key === "Enter" || e.key === "Escape") {
        leave();
      }
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("wheel", stopFilm, { passive: true });
    sc.addEventListener("touchstart", stopFilm, { passive: true });
    window.addEventListener("keydown", onKey);
    (window as unknown as { __sentinel?: unknown }).__sentinel = { rig, tl: tlRef.current };
    return () => {
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("wheel", stopFilm);
      sc.removeEventListener("touchstart", stopFilm);
      window.removeEventListener("keydown", onKey);
      gsap.killTweensOf(sc);
      gsap.killTweensOf(rig);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFilm = () => {
    const sc = scroller.current;
    if (!sc) return;
    if (film) {
      gsap.killTweensOf(sc);
      setFilm(false);
      return;
    }
    const end = sc.scrollHeight - sc.clientHeight;
    const remaining = Math.max(0.05, 1 - sc.scrollTop / end);
    setFilm(true);
    gsap.to(sc, { scrollTop: end, duration: 46 * remaining, ease: "none", overwrite: true, onComplete: () => setFilm(false) });
  };

  const title = "SENTINEL";
  const ui = "pointer-events-auto border border-white/25 bg-black/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.2em] text-slate-200 hover:border-cyan-300 hover:text-white";

  return (
    <div ref={root} className="fixed inset-0 bg-[#02060f] text-white">
      <div ref={scroller} className="absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none]">
        <div style={{ height: `${(DUR + 1) * 100}vh` }}>
          <div className="sticky top-0 h-screen w-full overflow-hidden">
            <img src="/media/twin_render_1.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
            <ParticleStage rig={rig} onReady={onReady} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,6,15,0.7)_100%)]" />

            <div className="pointer-events-none absolute inset-0">
              {/* 0 · HERO */}
              <Scene i={0} side="left">
                <div className="hero-sub text-[11px] font-mono uppercase tracking-[0.4em] text-cyan-300/90 mb-4">NASA Space Apps 2026 · Team Deadstar</div>
                <h1 className="flex overflow-hidden pb-2 whitespace-nowrap text-[15vw] lg:text-[clamp(4rem,8vw,9rem)] font-semibold leading-[0.95] tracking-[0.05em] bg-gradient-to-b from-white via-cyan-100 to-cyan-400/70 bg-clip-text text-transparent">
                  {title.split("").map((c, i) => (<span key={i} className="ch inline-block">{c}</span>))}
                </h1>
                <p className="hero-sub mt-5 text-xl sm:text-3xl text-white font-medium leading-snug">The flight surgeon that doesn't wait for Earth.</p>
                <p className="hero-sub mt-3 text-sm sm:text-base text-slate-300 max-w-md">An autonomous medical officer and living digital twin for crews beyond the reach of real-time help. Move your cursor through the hologram: it is live.</p>
                <div className="hero-sub mt-7 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-cyan-400/30 bg-cyan-400/5 text-[12px] font-mono text-cyan-100">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE · crew → Earth light time now: {s.owltMin.toFixed(1)} min
                  </span>
                  <button type="button" onClick={() => goTo(1)} className={`${ui} px-3 py-1.5 !tracking-[0.16em]`}>Begin ↓</button>
                </div>
              </Scene>

              {/* 1 · DISTANCE */}
              <section className="sc sc-1 absolute inset-0 flex flex-col items-center justify-between py-[9vh] px-6 text-center" style={{ visibility: "hidden", opacity: 0 }}>
                <div>
                  <div className="rv"><Kicker>01 · The distance</Kicker></div>
                  <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">Help is a <span className="text-cyan-300">light-speed</span> round trip away.</h2>
                </div>
                <div className="absolute inset-0 text-[11px] font-mono uppercase tracking-[0.2em]">
                  <span className="rv absolute -translate-x-1/2 text-center text-sky-300" style={{ left: `${geo.earthX}%`, top: `${geo.earthY}%` }}>Earth<br /><span className="text-slate-400">flight surgeon</span></span>
                  <span className="rv absolute -translate-x-1/2 text-center text-rose-300" style={{ left: `${geo.shipX}%`, top: `${geo.shipY}%` }}>Crew<br /><span className="text-slate-400 whitespace-nowrap">Mars transit · day {s.day}/{s.duration}</span></span>
                </div>
                <div>
                  <div className="rv flex items-end justify-center gap-3">
                    <span className="dist-clock text-[20vw] sm:text-[8.5rem] font-semibold tabular-nums leading-none">0.0</span>
                    <span className="pb-3 text-xl text-slate-300 text-left">min<span className="dist-leg block text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Crew → Earth</span></span>
                  </div>
                  <p className="dist-punch mt-4 text-base sm:text-xl text-slate-200 max-w-2xl mx-auto">
                    {(2 * s.owltMin).toFixed(1)} minutes for the signal alone. Near solar conjunction it is over 40, and sometimes there is no link at all.
                  </p>
                </div>
              </section>

              {/* 2 · DECISION */}
              <Scene i={2} side="right">
                <div className="rv"><Kicker>02 · The decision</Kicker></div>
                <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">A fever won't wait for the answer.</h2>
                <p className="rv mt-3 text-slate-300">{s.crewName}: temperature, heart rate and HRV are drifting together. Chance of fever ≥ 38 °C within 24 h: <b className="fever-n text-white tabular-nums">0%</b></p>
                <div className="rv mt-8 space-y-5">
                  <div>
                    <div className="flex justify-between text-[12px] font-mono uppercase tracking-[0.15em] text-rose-200"><span>Act within</span><span className="whitespace-nowrap">{s.actMin} min</span></div>
                    <div className="mt-1.5 h-4 bg-white/5"><div className="bar-act h-full origin-left bg-gradient-to-r from-rose-500 to-rose-300 shadow-[0_0_24px_rgba(251,113,133,0.5)]" style={{ width: `${(s.actMin / max) * 100}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] font-mono uppercase tracking-[0.15em] text-sky-200"><span>Earth's answer arrives</span><span className="whitespace-nowrap">{s.earthMin.toFixed(1)} min</span></div>
                    <div className="mt-1.5 h-4 bg-white/5"><div className="bar-earth h-full origin-left bg-gradient-to-r from-sky-500 to-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.5)]" style={{ width: `${(s.earthMin / max) * 100}%` }} /></div>
                  </div>
                </div>
                <div className="verdict mt-9 inline-block px-5 py-3 border-2 border-rose-300 text-xl sm:text-3xl font-semibold tracking-[0.12em] text-rose-100 shadow-[0_0_60px_rgba(251,113,133,0.45)] bg-rose-500/10">
                  SENTINEL ACTS ON BOARD
                </div>
                <p className="verdict-note mt-4 text-slate-300">The onboard infection protocol starts now. Earth gets a compressed report and can overrule, but the crew never waits on physics.</p>
              </Scene>

              {/* 3 · TWIN */}
              <Scene i={3} side="left">
                <div className="rv"><Kicker>03 · The twin</Kicker></div>
                <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">Every crew member, mirrored.</h2>
                <p className="rv mt-4 text-slate-300 text-lg">A realistic body built in Blender, alive as a hologram. Each organ is tied to one of NASA's {s.risks} Human Research Program risks and to signals forecast hour by hour, with honest uncertainty bands.</p>
                <div className="mt-6 space-y-2">
                  {[
                    ["Brain", "sleep, cognition, reaction time", "text-pink-200 border-pink-300/40"],
                    ["Heart & blood", "heart rate, plasma volume, pressure", "text-rose-200 border-rose-300/40"],
                    ["Immune", "fever risk from temperature, HR and HRV together", "text-amber-200 border-amber-300/40"],
                    ["Bone & muscle", "hip density and leg strength against NASA limits", "text-sky-200 border-sky-300/40"],
                  ].map(([k, v, cls]) => (
                    <div key={k} className={`co flex items-baseline gap-3 border-l-2 pl-3 ${cls}`}>
                      <span className="text-[12px] font-mono uppercase tracking-[0.18em] w-32 shrink-0">{k}</span>
                      <span className="text-sm text-slate-300">{v}</span>
                    </div>
                  ))}
                </div>
              </Scene>

              {/* 4 · PROOF */}
              <Scene i={4} side="right">
                <div className="rv"><Kicker>04 · The proof</Kicker></div>
                <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">Built on NASA science. Graded on its own record.</h2>
                <div className="mt-8 grid grid-cols-2 gap-3 [perspective:900px]">
                  {[
                    ["n-risks", "NASA HRP risks modelled", "Human Research Program"],
                    ["n-sig", "signals forecast", "hourly and daily, 80/95 % bands"],
                    ["n-cov", "of outcomes inside the 80 % band", "back-tested, 24 h ahead"],
                    ["n-src", "NASA, NOAA & JPL sources", "every constant links to its source"],
                  ].map(([cls, label, note]) => (
                    <div key={cls} className="stat p-4 border border-cyan-400/25 bg-[#02060f]/70 backdrop-blur-sm">
                      <div className={`${cls} text-4xl sm:text-5xl font-semibold tabular-nums text-white`}>0</div>
                      <div className="mt-1.5 text-sm text-slate-200">{label}</div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500">{note}</div>
                    </div>
                  ))}
                </div>
              </Scene>

              {/* 5 · ENTER */}
              <Scene i={5} side="left">
                <div className="rv"><Kicker>Mission control</Kicker></div>
                <h2 className="rv mt-3 text-4xl sm:text-6xl font-semibold leading-tight">Meet the crew.</h2>
                <p className="rv mt-4 text-lg text-slate-200">Four synthetic astronauts. Day {s.day} of a {s.duration}-day Mars transit. One of them needs you now.</p>
                <div className="rv relative inline-block mt-8">
                  <span className="cta-ring absolute inset-0 border border-cyan-300 pointer-events-none" />
                  <button type="button" onClick={leave} className="pointer-events-auto relative px-10 py-4 bg-cyan-300 text-[#02060f] text-sm font-semibold uppercase tracking-[0.25em] hover:bg-white shadow-[0_0_50px_rgba(103,232,249,0.55)]">
                    Enter mission control
                  </button>
                </div>
                <p className="rv mt-6 text-[10px] font-mono tracking-[0.25em] text-slate-400">SYNTHETIC CREW · DECISION SUPPORT, NOT DIAGNOSIS</p>
              </Scene>
            </div>

            {/* chrome: progress, scene dots, film, skip */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5"><div className="prog h-full origin-left bg-gradient-to-r from-cyan-400 to-white" style={{ transform: "scaleX(0)" }} /></div>
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <button type="button" onClick={toggleFilm} className={`${ui} px-3 py-1.5 flex items-center gap-1.5`} title="Play the whole story hands-free">
                {film ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}{film ? "Stop" : "Play film"}
              </button>
              <button type="button" onClick={leave} className={`${ui} px-3 py-1.5`}>Skip ›</button>
            </div>
            <nav className="absolute right-4 top-1/2 -translate-y-1/2 z-10 hidden sm:flex flex-col gap-3" aria-label="Story scenes">
              {NAMES.map((n, i) => (
                <button key={n} type="button" onClick={() => { setFilm(false); goTo(i); }} title={n} aria-label={n} aria-current={active === i} className="pointer-events-auto group flex items-center justify-end gap-2">
                  <span className={`text-[10px] font-mono uppercase tracking-[0.18em] transition-opacity ${active === i ? "opacity-100 text-white" : "opacity-0 group-hover:opacity-100 text-slate-300"}`}>{n}</span>
                  <span className={`block rounded-full transition-all ${active === i ? "w-2.5 h-2.5 bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" : "w-1.5 h-1.5 bg-white/40 group-hover:bg-white"}`} />
                </button>
              ))}
            </nav>
            <div className="hint pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-[10px] font-mono tracking-[0.3em] text-slate-300">
              SCROLL · OR PRESS →
              <ChevronDown className="hint-chev w-4 h-4 text-cyan-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ boot reveal over mission control */
export function BootOverlay() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [gone, setGone] = useState(false);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => setGone(true) });
      tl.from(".boot-line", { opacity: 0, x: -12, stagger: 0.16, duration: 0.3 })
        .fromTo(".boot-scan", { top: "-2%" }, { top: "102%", duration: 0.9, ease: "power2.inOut" }, "+=0.15")
        .to(ref.current, { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "power3.inOut" }, "<0.1");
    }, ref);
    const safety = window.setTimeout(() => setGone(true), 3800); // never leave a curtain over the app
    return () => {
      window.clearTimeout(safety);
      ctx.revert();
    };
  }, []);
  if (gone) return null;
  return (
    <div ref={ref} className="pointer-events-none fixed inset-0 z-[80] bg-[#02060f] flex items-center justify-center" style={{ clipPath: "inset(0 0 0% 0)" }}>
      <div className="boot-scan absolute left-0 right-0 h-px bg-cyan-300 shadow-[0_0_30px_6px_rgba(103,232,249,0.8)]" />
      <div className="font-mono text-[13px] text-cyan-100 space-y-1.5">
        {["Linking JPL ephemeris · light time computed", "Loading crew twins · 4 astronauts", "Forecasts calibrated · 80/95 % bands", "SENTINEL ONLINE"].map((t, i) => (
          <div key={t} className={`boot-line ${i === 3 ? "text-white text-base tracking-[0.3em] pt-2" : ""}`}>{i < 3 ? "▸ " : ""}{t}</div>
        ))}
      </div>
    </div>
  );
}
