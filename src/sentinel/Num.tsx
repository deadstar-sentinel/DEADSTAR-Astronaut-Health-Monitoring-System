import { useEffect, useRef } from "react";

/** A number that glides to its new value (and counts up from zero the first time it appears). */
export function Num({ value, decimals = 0, duration = 650 }: { value: number; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el) return;
    if (from === value || !Number.isFinite(value)) {
      el.textContent = Number.isFinite(value) ? value.toFixed(decimals) : "—";
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = (from + (value - from) * e).toFixed(decimals);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // If frames are throttled (background tab), still land on the right value.
    const done = window.setTimeout(() => {
      el.textContent = value.toFixed(decimals);
    }, duration + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [value, decimals, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {(0).toFixed(decimals)}
    </span>
  );
}
