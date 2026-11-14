import { useEffect, useRef } from "react";
import type { AnatomyId } from "../data/anatomyCatalog.ts";
import { useSentinel } from "./api.tsx";
import { Num } from "./Num.tsx";

/** One synthetic PQRST beat, phase 0..1. */
function ecg(p: number): number {
  const g = (c: number, w: number) => Math.exp(-(((p - c) / w) ** 2));
  return 0.12 * g(0.18, 0.03) - 0.12 * g(0.36, 0.012) + 1.0 * g(0.39, 0.014) - 0.22 * g(0.425, 0.014) + 0.28 * g(0.62, 0.05);
}

function EcgTrace({ bpm, color }: { bpm: number; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rate = useRef(bpm);
  rate.current = bpm;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let phase = 0;
    let last = performance.now();
    const SPAN = 2.6; // seconds across the strip
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const hz = rate.current / 60;
      phase += dt * hz;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 1) {
        const t = phase - ((W - x) / W) * SPAN * hz;
        const y = H * 0.72 - ecg(((t % 1) + 1) % 1) * H * 0.6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // leading dot
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(W - 1.5, H * 0.72 - ecg(((phase % 1) + 1) % 1) * H * 0.6, 2, 0, Math.PI * 2);
      ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={ref} className="w-full h-12 block" aria-hidden="true" />;
}

const ROWS: { key: string; label: string; organ: AnatomyId; dec: number }[] = [
  { key: "spo2", label: "SpO₂", organ: "lungs", dec: 1 },
  { key: "temp", label: "Core temp", organ: "circulatory", dec: 2 },
  { key: "rr", label: "Resp rate", organ: "lungs", dec: 1 },
  { key: "hrv", label: "HRV", organ: "nervous", dec: 0 },
];

/** Live vitals of the selected crew member, beside the body. Each row jumps to its organ. */
export function VitalsHud({ onSelectOrgan }: { onSelectOrgan: (id: AnatomyId, focusZoom: boolean) => void }) {
  const { mission, meta, crewId } = useSentinel();
  const crew = mission?.crew.find((c) => c.id === crewId);
  const v = crew?.vitals;
  if (!crew || !v) return null;
  const out = (key: string) => {
    const n = meta?.signals[key]?.normal;
    return !!n && (v[key] < n[0] || v[key] > n[1]);
  };
  const unit = (key: string) => meta?.signals[key]?.unit ?? "";
  const hrBad = out("hr");
  const row = "w-full flex items-baseline justify-between gap-2 px-2.5 py-1 text-left border-t border-cyan-500/10 hover:bg-cyan-400/10";
  return (
    <div key={crewId} className="sx-rise hidden lg:block absolute top-3 right-3 z-10 w-[188px] bg-[#040d1c]/88 border border-cyan-400/25 backdrop-blur-sm shadow-[0_0_24px_rgba(0,140,255,0.15)]">
      <div className="px-2.5 pt-1.5 flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-cyan-300">Live vitals</span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">{crew.short ?? crew.name}</span>
      </div>
      <button type="button" title="Open heart forecast" onClick={() => onSelectOrgan("heart", true)} className="w-full text-left hover:bg-cyan-400/10">
        <EcgTrace bpm={v.hr} color={hrBad ? "#fb7185" : "#34d399"} />
        <div className="px-2.5 pb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-mono uppercase text-slate-400">Heart rate</span>
          <span className={`text-lg font-semibold ${hrBad ? "text-rose-200" : "text-white"}`}>
            <Num value={v.hr} /> <span className="text-[10px] font-normal text-slate-400">bpm</span>
          </span>
        </div>
      </button>
      {ROWS.map((r) =>
        v[r.key] == null ? null : (
          <button key={r.key} type="button" title={`Open ${r.label} forecast`} onClick={() => onSelectOrgan(r.organ, true)} className={row}>
            <span className="text-[10px] font-mono uppercase text-slate-400">{r.label}</span>
            <span className={`text-[13px] font-mono ${out(r.key) ? "text-amber-200" : "text-white"}`}>
              <Num value={v[r.key]} decimals={r.dec} /> <span className="text-[10px] text-slate-400">{unit(r.key)}</span>
            </span>
          </button>
        ),
      )}
      {v.sbp != null && v.dbp != null && (
        <button type="button" title="Open circulation forecast" onClick={() => onSelectOrgan("circulatory", true)} className={row}>
          <span className="text-[10px] font-mono uppercase text-slate-400">Blood pressure</span>
          <span className={`text-[13px] font-mono ${out("sbp") ? "text-amber-200" : "text-white"}`}>
            <Num value={v.sbp} />/<Num value={v.dbp} /> <span className="text-[10px] text-slate-400">mmHg</span>
          </span>
        </button>
      )}
    </div>
  );
}
