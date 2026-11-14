import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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
    Promise.all([fetch("/api/state").then((r) => r.json()), fetch("/api/meta").then((r) => r.json())])
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
    fetch("/api/validation")
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

/* ------------------------------------------------------------------ warp starfield: streaks with scroll speed */
function Starfield({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const sc = scroller.current;
    if (!cv || !sc) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const N = 520;
    const stars = Array.from({ length: N }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = sc.scrollTop;
    let vel = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const frame = () => {
      const d = sc.scrollTop - last;
      last = sc.scrollTop;
      vel += (Math.min(60, Math.abs(d)) - vel) * 0.12;
      const speed = 0.0009 + vel * 0.0011;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.z -= speed;
        if (s.z <= 0.02) {
          s.x = Math.random() * 2 - 1;
          s.y = Math.random() * 2 - 1;
          s.z = 1;
        }
        const k = 0.55 / s.z;
        const px = w / 2 + s.x * k * w * 0.5;
        const py = h / 2 + s.y * k * h * 0.5;
        if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue;
        const a = Math.min(1, (1 - s.z) * 1.3);
        const len = 1 + vel * 0.9 * (1 - s.z);
        const dx = (px - w / 2) / Math.max(1, Math.hypot(px - w / 2, py - h / 2));
        const dy = (py - h / 2) / Math.max(1, Math.hypot(px - w / 2, py - h / 2));
        ctx.strokeStyle = `rgba(${170 + 60 * (1 - s.z)},${225},255,${a})`;
        ctx.lineWidth = Math.max(0.6, (1 - s.z) * 1.8);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - dx * len, py - dy * len);
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [scroller]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 w-full h-full" aria-hidden="true" />;
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <div className="rv text-[11px] font-mono uppercase tracking-[0.32em] text-cyan-300/90">{children}</div>
);

/* ------------------------------------------------------------------ landing */
export function Landing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const story = useStory();
  const s = story ?? FALLBACK;
  const live = useRef(s);
  live.current = s;
  const ready = story !== null;
  const title = "SENTINEL";

  // Hero plays immediately on load — it never waits for data.
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !root.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".ch", { yPercent: 110, opacity: 0, filter: "blur(14px)", duration: 1.3, stagger: 0.06, ease: "expo.out", delay: 0.1 });
      gsap.from(".hero-sub", { y: 24, opacity: 0, duration: 1.1, stagger: 0.12, delay: 0.6, ease: "power3.out" });
      gsap.fromTo(".hero-bg", { scale: 1.18, opacity: 0 }, { scale: 1.02, opacity: 0.62, duration: 2.6, ease: "power2.out" });
      gsap.to(".hero-inner", { yPercent: -35, opacity: 0, ease: "none", scrollTrigger: { scroller: sc, trigger: ".s-hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".hero-bg", { yPercent: 18, ease: "none", scrollTrigger: { scroller: sc, trigger: ".s-hero", start: "top top", end: "bottom top", scrub: true } });
    }, root);
    return () => ctx.revert();
  }, []);

  useLayoutEffect(() => {
    if (!ready || !scroller.current || !root.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sc = scroller.current;
    const ctx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller: sc });
      const count = (sel: string, to: number, dec = 0, suffix = "") => {
        const el = root.current?.querySelector(sel);
        if (!el) return gsap.to({}, { duration: 0 });
        const o = { v: 0 };
        return gsap.to(o, { v: to, duration: 1.4, ease: "power2.out", onUpdate: () => { el.textContent = o.v.toFixed(dec) + suffix; } });
      };
      if (reduce) return;


      // 01 Distance: a photon crosses to Earth and back; the clock runs with your scroll.
      const owlt = live.current.owltMin;
      const clock = root.current?.querySelector(".dist-clock");
      const leg = root.current?.querySelector(".dist-leg");
      const tl = gsap.timeline({ scrollTrigger: { trigger: ".s-dist", start: "top top", end: "+=220%", scrub: 0.6, pin: true } });
      tl.from(".s-dist .rv", { y: 30, opacity: 0, stagger: 0.08, duration: 0.25 })
        .fromTo(".photon", { left: "0%" }, { left: "100%", duration: 1, ease: "none", onUpdate(this: gsap.core.Tween) {
          if (clock) clock.textContent = (this.progress() * owlt).toFixed(1);
          if (leg) leg.textContent = "Crew → Earth";
        } })
        .to(".dist-earth", { boxShadow: "0 0 60px 18px rgba(56,189,248,0.75)", duration: 0.1 })
        .fromTo(".photon", { left: "100%" }, { left: "0%", duration: 1, ease: "none", immediateRender: false, onUpdate(this: gsap.core.Tween) {
          if (clock) clock.textContent = (owlt + this.progress() * owlt).toFixed(1);
          if (leg) leg.textContent = "Earth → Crew";
        } })
        .to(".dist-ship", { boxShadow: "0 0 60px 18px rgba(251,113,133,0.7)", duration: 0.1 })
        .from(".dist-punch", { y: 20, opacity: 0, duration: 0.3 });

      // 02 Decision: the problem's deadline vs Earth's answer — then the verdict slams in.
      const L = live.current;
      const max = Math.max(L.actMin, L.earthMin) * 1.08;
      const tl2 = gsap.timeline({ scrollTrigger: { trigger: ".s-dec", start: "top top", end: "+=170%", scrub: 0.6, pin: true } });
      tl2.from(".s-dec .rv", { y: 30, opacity: 0, stagger: 0.08, duration: 0.25 })
        .fromTo(".bar-act", { scaleX: 0 }, { scaleX: L.actMin / max, duration: 0.6, ease: "power2.out" })
        .fromTo(".bar-earth", { scaleX: 0 }, { scaleX: L.earthMin / max, duration: 0.6, ease: "power2.out" }, "<0.15")
        .fromTo(".verdict", { scale: 2.4, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.35, ease: "back.out(2)" })
        .from(".verdict-note", { y: 16, opacity: 0, duration: 0.25 });
      ScrollTrigger.create({ trigger: ".s-dec", start: "top 30%", once: true, onEnter: () => { count(".fever-n", live.current.feverPct, 0, "%"); } });

      // 03 Twin: parallax render, anatomy callouts draw themselves in.
      gsap.fromTo(".twin-img", { yPercent: 12, scale: 1.12 }, { yPercent: -8, scale: 1, ease: "none", scrollTrigger: { trigger: ".s-twin", start: "top bottom", end: "bottom top", scrub: true } });
      gsap.from(".s-twin .rv", { y: 40, opacity: 0, stagger: 0.12, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".s-twin", start: "top 65%" } });
      gsap.utils.toArray<SVGPathElement>(".callout-path").forEach((p, i) => {
        const L = p.getTotalLength();
        gsap.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.1, delay: 0.25 + i * 0.18, ease: "power2.inOut", scrollTrigger: { trigger: ".s-twin", start: "top 55%" } });
      });
      gsap.from(".callout-tag", { opacity: 0, x: 12, stagger: 0.18, delay: 0.9, duration: 0.6, scrollTrigger: { trigger: ".s-twin", start: "top 55%" } });

      // 04 Proof: cards rise, numbers count up once.
      gsap.from(".stat", { y: 50, opacity: 0, rotateX: -18, stagger: 0.12, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".s-proof", start: "top 70%" } });
      ScrollTrigger.create({ trigger: ".s-proof", start: "top 65%", once: true, onEnter: () => {
        const v = live.current;
        count(".n-risks", v.risks); count(".n-sig", v.signals); count(".n-cov", v.cover80, 0, "%"); count(".n-src", v.sources);
      } });

      // CTA
      gsap.from(".s-cta .rv", { y: 30, opacity: 0, stagger: 0.12, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".s-cta", start: "top 70%" } });
      gsap.to(".cta-ring", { scale: 1.5, opacity: 0, duration: 1.8, repeat: -1, ease: "power2.out" });
    }, root);
    return () => {
      ctx.revert();
      ScrollTrigger.defaults({ scroller: window });
    };
  }, [ready]);

  const enter = () => {
    if (!root.current) return onEnter();
    gsap.to(root.current, { opacity: 0, scale: 1.08, filter: "blur(10px)", duration: 0.75, ease: "power2.in", onComplete: onEnter });
  };

  return (
    <div ref={root} className="fixed inset-0 bg-[#02060f] text-white">
      <div ref={scroller} className="absolute inset-0 overflow-y-auto overflow-x-hidden med-scroll">
        <Starfield scroller={scroller} />
        <button type="button" onClick={enter} className="fixed top-4 right-4 z-50 px-3 py-1.5 border border-white/25 bg-black/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.2em] text-slate-200 hover:border-cyan-300 hover:text-white">
          Skip intro ›
        </button>

        {/* HERO */}
        <section className="s-hero relative h-screen flex items-center justify-center overflow-hidden">
          <img src="/media/twin_render_1.jpg" alt="" className="hero-bg absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(2,6,15,0.15)_0%,rgba(2,6,15,0.85)_70%,#02060f_100%)]" />
          <div className="hero-inner relative text-center px-6">
            <div className="hero-sub text-[11px] font-mono uppercase tracking-[0.4em] text-cyan-300/90 mb-5">NASA Space Apps 2026 · Team Deadstar</div>
            <h1 className="flex justify-center overflow-hidden text-[18vw] sm:text-[12vw] lg:text-[10rem] font-semibold leading-none tracking-[0.08em] bg-gradient-to-b from-white via-cyan-100 to-cyan-400/70 bg-clip-text text-transparent">
              {title.split("").map((c, i) => (<span key={i} className="ch inline-block">{c}</span>))}
            </h1>
            <p className="hero-sub mt-6 text-xl sm:text-2xl text-slate-100">The flight surgeon that doesn't wait for Earth.</p>
            <p className="hero-sub mt-2 text-sm sm:text-base text-slate-400 max-w-xl mx-auto">An autonomous medical officer and digital twin for crews beyond the reach of real-time help.</p>
            <div className="hero-sub mt-8 inline-flex items-center gap-2 px-3 py-1.5 border border-cyan-400/30 bg-cyan-400/5 text-[12px] font-mono text-cyan-100">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE · crew → Earth light time today: {s.owltMin.toFixed(1)} min
            </div>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-slate-400">
            SCROLL
            <span className="block w-px h-10 bg-gradient-to-b from-cyan-300 to-transparent animate-pulse" />
          </div>
        </section>

        {/* 01 DISTANCE */}
        <section className="s-dist relative h-screen flex items-center justify-center px-6">
          <div className="w-full max-w-5xl">
            <Kicker>01 · The distance</Kicker>
            <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">Help is a <span className="text-cyan-300">light-speed</span> round trip away.</h2>
            <div className="rv mt-12 flex items-end gap-4">
              <div className="text-[18vw] sm:text-[9rem] font-semibold tabular-nums leading-none"><span className="dist-clock">0.0</span></div>
              <div className="pb-4 text-xl text-slate-300">min<div className="dist-leg text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Crew → Earth</div></div>
            </div>
            <div className="rv relative mt-10 h-14">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-sky-400/70 via-white/30 to-rose-400/70" />
              <div className="dist-earth absolute top-1/2 left-0 -translate-y-1/2 w-5 h-5 rounded-full bg-sky-400" />
              <div className="dist-ship absolute top-1/2 right-0 -translate-y-1/2 w-5 h-5 rounded-full bg-rose-400" />
              <div className="photon absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_24px_8px_rgba(165,243,252,0.9)]" />
              <div className="absolute -bottom-6 left-0 text-[11px] font-mono uppercase tracking-[0.2em] text-sky-300">Earth · flight surgeon</div>
              <div className="absolute -bottom-6 right-0 text-[11px] font-mono uppercase tracking-[0.2em] text-rose-300 text-right">Crew · Mars transit day {s.day}/{s.duration}</div>
            </div>
            <p className="dist-punch mt-16 text-lg sm:text-2xl text-slate-200 max-w-3xl">
              {(2 * s.owltMin).toFixed(1)} minutes just for the signal — before anyone on Earth has read it. Near conjunction, over 40.
            </p>
          </div>
        </section>

        {/* 02 DECISION */}
        <section className="s-dec relative h-screen flex items-center justify-center px-6">
          <div className="w-full max-w-5xl">
            <Kicker>02 · The decision</Kicker>
            <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">A fever won't wait for the answer.</h2>
            <p className="rv mt-3 text-slate-300">{s.crewName}: temperature, heart rate and HRV drifting together. P(fever ≥ 38 °C within 24 h): <b className="fever-n text-white tabular-nums">0%</b></p>
            <div className="rv mt-10 space-y-5">
              <div>
                <div className="flex justify-between text-[12px] font-mono uppercase tracking-[0.15em] text-rose-200"><span>Problem arrives — act within</span><span>{s.actMin} min</span></div>
                <div className="mt-1.5 h-4 bg-white/5"><div className="bar-act h-full origin-left bg-gradient-to-r from-rose-500 to-rose-300 shadow-[0_0_24px_rgba(251,113,133,0.5)]" /></div>
              </div>
              <div>
                <div className="flex justify-between text-[12px] font-mono uppercase tracking-[0.15em] text-sky-200"><span>Earth's answer arrives</span><span>{s.earthMin.toFixed(1)} min</span></div>
                <div className="mt-1.5 h-4 bg-white/5"><div className="bar-earth h-full origin-left bg-gradient-to-r from-sky-500 to-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.5)]" /></div>
              </div>
            </div>
            <div className="verdict mt-12 inline-block px-6 py-3 border-2 border-rose-300 text-2xl sm:text-4xl font-semibold tracking-[0.12em] text-rose-100 shadow-[0_0_60px_rgba(251,113,133,0.45)] bg-rose-500/10">
              SENTINEL ACTS ON BOARD
            </div>
            <p className="verdict-note mt-4 text-slate-300 max-w-2xl">The onboard infection protocol starts now. Earth receives a compressed report and can overrule — but the crew never waits on physics.</p>
          </div>
        </section>

        {/* 03 TWIN */}
        <section className="s-twin relative min-h-screen flex items-center px-6 py-24 overflow-hidden">
          <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <Kicker>03 · The twin</Kicker>
              <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">Every crew member, mirrored.</h2>
              <p className="rv mt-5 text-slate-300 text-lg">A realistic body designed in Blender and rendered as a living hologram. Each organ is tied to one of NASA's {s.risks} Human Research Program risks and to signals forecast hour by hour, with honest uncertainty bands.</p>
              <p className="rv mt-3 text-slate-400">Tap an organ: see its risk, its forecast, and whether to act now or ask Earth.</p>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden border border-cyan-400/20">
              <img src="/media/twin_render_2.jpg" alt="Ray-traced render of the SENTINEL hologram twin" className="twin-img absolute inset-0 w-full h-full object-cover" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                <path className="callout-path" d="M80 16 L100 12 L128 12" stroke="#a5f3fc" strokeWidth="0.35" fill="none" />
                <path className="callout-path" d="M82 34 L104 30 L128 30" stroke="#a5f3fc" strokeWidth="0.35" fill="none" />
                <path className="callout-path" d="M78 47 L56 44 L30 44" stroke="#fda4af" strokeWidth="0.35" fill="none" />
              </svg>
              <div className="callout-tag absolute right-[4%] top-[8%] text-[11px] font-mono text-cyan-100 bg-black/50 px-1.5">BRAIN · sleep 4.9 h</div>
              <div className="callout-tag absolute right-[4%] top-[26%] text-[11px] font-mono text-cyan-100 bg-black/50 px-1.5">HEART · HR forecast</div>
              <div className="callout-tag absolute left-[4%] top-[40%] text-[11px] font-mono text-rose-100 bg-black/50 px-1.5">IMMUNE · fever risk</div>
            </div>
          </div>
        </section>

        {/* 04 PROOF */}
        <section className="s-proof relative min-h-screen flex items-center px-6 py-24 [perspective:1000px]">
          <div className="w-full max-w-6xl mx-auto">
            <Kicker>04 · The proof</Kicker>
            <h2 className="rv mt-3 text-3xl sm:text-5xl font-semibold leading-tight">Built on NASA science. Graded on its own record.</h2>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ["n-risks", "NASA HRP risks modelled", "Human Research Program"],
                ["n-sig", "physiological signals forecast", "hourly and daily, 80/95 % bands"],
                ["n-cov", "of outcomes inside the 80 % band", "back-tested, 24-hour horizon"],
                ["n-src", "NASA & JPL sources cited", "every constant links to its source"],
              ].map(([cls, label, note]) => (
                <div key={cls} className="stat p-5 border border-cyan-400/20 bg-gradient-to-b from-cyan-400/[0.07] to-transparent">
                  <div className={`${cls} text-5xl font-semibold tabular-nums text-white`}>0</div>
                  <div className="mt-2 text-sm text-slate-200">{label}</div>
                  <div className="mt-1 text-[11px] font-mono text-slate-500">{note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="s-cta relative h-screen flex items-center justify-center px-6 text-center">
          <div>
            <h2 className="rv text-3xl sm:text-6xl font-semibold leading-tight">Meet the crew.</h2>
            <p className="rv mt-4 text-slate-300">Four synthetic astronauts. Day {s.day} of a {s.duration}-day Mars transit. One of them needs you now.</p>
            <div className="rv relative inline-block mt-10">
              <span className="cta-ring absolute inset-0 border border-cyan-300 pointer-events-none" />
              <button type="button" onClick={enter} className="relative px-10 py-4 bg-cyan-300 text-[#02060f] text-sm font-semibold uppercase tracking-[0.25em] hover:bg-white transition-colors shadow-[0_0_50px_rgba(103,232,249,0.55)]">
                Enter mission control
              </button>
            </div>
            <p className="rv mt-8 text-[10px] font-mono tracking-[0.25em] text-slate-500">SYNTHETIC CREW · DECISION SUPPORT, NOT DIAGNOSIS</p>
          </div>
        </section>
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
    return () => ctx.revert();
  }, []);
  if (gone) return null;
  return (
    <div ref={ref} className="fixed inset-0 z-[80] bg-[#02060f] flex items-center justify-center" style={{ clipPath: "inset(0 0 0% 0)" }}>
      <div className="boot-scan absolute left-0 right-0 h-px bg-cyan-300 shadow-[0_0_30px_6px_rgba(103,232,249,0.8)]" />
      <div className="font-mono text-[13px] text-cyan-100 space-y-1.5">
        {["Linking JPL ephemeris · light time computed", "Loading crew twins · 4 astronauts", "Forecasts calibrated · 80/95 % bands", "SENTINEL ONLINE"].map((t, i) => (
          <div key={t} className={`boot-line ${i === 3 ? "text-white text-base tracking-[0.3em] pt-2" : ""}`}>{i < 3 ? "▸ " : ""}{t}</div>
        ))}
      </div>
    </div>
  );
}
