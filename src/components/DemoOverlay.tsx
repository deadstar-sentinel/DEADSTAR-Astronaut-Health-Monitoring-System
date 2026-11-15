import { Square } from "lucide-react";

export interface DemoState {
  step: number;
  total: number;
  title: string;
  caption: string;
  /** How long this step lasts, for the progress bar. */
  ms: number;
}

/** Cinematic caption card for the self-playing judge tour. Any click or key elsewhere takes control. */
export function DemoOverlay({ demo, onStop }: { demo: DemoState; onStop: () => void }) {
  return (
    <div
      data-demo-overlay
      data-testid="demo-overlay"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4"
    >
      <div key={demo.step} className="sx-rise pointer-events-auto w-[min(640px,100%)] border border-cyan-300/50 bg-[#030a16]/92 backdrop-blur-md shadow-[0_0_40px_rgba(0,229,255,0.18)]">
        <div className="h-0.5 bg-cyan-500/15 overflow-hidden">
          <div className="h-full bg-cyan-300 origin-left" style={{ animation: `sx-grow ${demo.ms}ms linear both` }} />
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300">
            <span className="w-1.5 h-1.5 bg-rose-400 animate-pulse" />
            Guided tour · {demo.step}/{demo.total} · {demo.title}
          </div>
          <p className="mt-1.5 text-[15px] leading-snug text-white">{demo.caption}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex gap-1" aria-hidden="true">
              {Array.from({ length: demo.total }, (_, i) => (
                <span key={i} className={`h-1 w-5 ${i < demo.step ? "bg-cyan-300" : "bg-cyan-500/20"}`} />
              ))}
            </div>
            <span className="text-[10px] font-mono text-slate-400">Click anywhere or press a key to take control</span>
            <button
              type="button"
              onClick={onStop}
              className="px-2 py-0.5 border border-cyan-400/40 text-[10px] font-mono uppercase text-cyan-100 hover:border-cyan-200 flex items-center gap-1"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
