import { Square, Volume2, VolumeX } from "lucide-react";

export interface DemoState {
  step: number;
  total: number;
  title: string;
  caption: string;
  /** Expected duration of this shot, for the progress bar. */
  ms: number;
  audience: "simple" | "expert";
  voice: boolean;
}

/**
 * Cinematic frame for the narrated walkthrough: letterbox bars, a soft vignette, and a
 * caption card synced to the narrator. Any click, tap or key elsewhere takes control.
 */
export function DemoOverlay({
  demo,
  onStop,
  onToggleVoice,
  persona,
  onPersona,
}: {
  demo: DemoState;
  onStop: () => void;
  onToggleVoice: () => void;
  persona: "warm" | "deep";
  onPersona: (p: "warm" | "deep") => void;
}) {
  return (
    <>
      {/* Letterbox + vignette: the app becomes a film while the tour plays */}
      <div className="pointer-events-none fixed inset-0 z-[65]" aria-hidden="true">
        <div className="sx-lb-top absolute inset-x-0 top-0 h-[5.5vh] bg-black/85" />
        <div className="sx-lb-bot absolute inset-x-0 bottom-0 h-[5.5vh] bg-black/85" />
        <div className="absolute inset-0 shadow-[inset_0_0_160px_40px_rgba(0,0,0,0.55)]" />
      </div>

      <div data-demo-overlay data-testid="demo-overlay" className="pointer-events-none fixed inset-x-0 bottom-[7vh] z-[70] flex justify-center px-3 sm:px-4">
        <div
          key={demo.step}
          className="sx-rise pointer-events-auto w-[min(680px,100%)] border border-cyan-300/45 bg-[#030a16]/90 backdrop-blur-md shadow-[0_0_48px_rgba(0,229,255,0.16)]"
        >
          <div className="h-0.5 bg-cyan-500/15 overflow-hidden">
            <div className="h-full bg-cyan-300 origin-left" style={{ animation: `sx-grow ${demo.ms}ms linear both` }} />
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300">
              <span className="w-1.5 h-1.5 bg-rose-400 animate-pulse" />
              <span className="truncate">
                {demo.step}/{demo.total} · {demo.title}
              </span>
              <span className="ml-auto px-1.5 py-px border border-cyan-400/30 text-cyan-200/80 tracking-wider">
                {demo.audience === "expert" ? "Expert" : "Simple"}
              </span>
            </div>
            <p className="mt-1.5 text-[15px] sm:text-[16px] leading-snug text-white sx-type">{demo.caption}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex gap-1 flex-1" aria-hidden="true">
                {Array.from({ length: demo.total }, (_, i) => (
                  <span key={i} className={`h-1 flex-1 max-w-6 transition-colors duration-500 ${i < demo.step ? "bg-cyan-300" : "bg-cyan-500/20"}`} />
                ))}
              </div>
              <div className="flex border border-cyan-400/40" role="group" aria-label="Narrator voice">
                {(["warm", "deep"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPersona(p)}
                    aria-pressed={persona === p}
                    title={p === "warm" ? "Warm female narrator" : "Deep male narrator"}
                    className={`px-1.5 py-1 text-[10px] font-mono uppercase ${persona === p ? "bg-cyan-500/25 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onToggleVoice}
                aria-pressed={demo.voice}
                className="px-2 py-1 border border-cyan-400/40 text-[10px] font-mono uppercase text-cyan-100 hover:border-cyan-200 flex items-center gap-1"
              >
                {demo.voice ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                {demo.voice ? "Voice on" : "Voice off"}
              </button>
              <button
                type="button"
                onClick={onStop}
                className="px-2 py-1 border border-cyan-400/40 text-[10px] font-mono uppercase text-cyan-100 hover:border-cyan-200 flex items-center gap-1"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            </div>
            <div className="mt-1.5 text-[10px] font-mono text-slate-500">Tap or click anywhere to take control</div>
          </div>
        </div>
      </div>
    </>
  );
}
