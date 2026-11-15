import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";

export interface DemoState {
  step: number;
  total: number;
  title: string;
  caption: string;
  /** Expected duration of this shot, for the progress bar. */
  ms: number;
  audience: "simple" | "expert";
  voice: boolean;
  /** Frozen mid-tour: narration and camera stopped, progress kept. */
  paused?: boolean;
}

const btn =
  "px-2 py-1.5 sm:py-1 border border-cyan-400/40 text-[10px] font-mono uppercase text-cyan-100 hover:border-cyan-200 hover:bg-cyan-500/10 flex items-center gap-1";

/**
 * Cinematic frame for the narrated walkthrough: letterbox bars, a soft vignette, and a
 * caption card synced to the narrator. Touching the scene pauses (progress is kept);
 * Resume continues from the same shot.
 */
export function DemoOverlay({
  demo,
  onStop,
  onPause,
  onResume,
  onRestart,
  onToggleVoice,
}: {
  demo: DemoState;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onToggleVoice: () => void;
}) {
  const paused = !!demo.paused;
  return (
    <>
      {/* Letterbox + vignette while playing; lifted while paused so the judge can explore */}
      {!paused && (
        <div className="pointer-events-none fixed inset-0 z-[65]" aria-hidden="true">
          <div className="sx-lb-top absolute inset-x-0 top-0 h-[5.5vh] bg-black/85" />
          <div className="sx-lb-bot absolute inset-x-0 bottom-0 h-[5.5vh] bg-black/85" />
          <div className="absolute inset-0 shadow-[inset_0_0_160px_40px_rgba(0,0,0,0.55)]" />
        </div>
      )}

      <div
        data-demo-overlay
        data-testid="demo-overlay"
        data-paused={paused ? "true" : "false"}
        className={`pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-3 sm:px-4 ${paused ? "bottom-3" : "bottom-[7vh]"}`}
      >
        <div
          key={demo.step}
          className={`sx-rise pointer-events-auto w-[min(680px,100%)] border bg-[#030a16]/90 backdrop-blur-md shadow-[0_0_48px_rgba(0,229,255,0.16)] ${
            paused ? "border-amber-300/50" : "border-cyan-300/45"
          }`}
        >
          <div className="h-0.5 bg-cyan-500/15 overflow-hidden">
            {paused ? (
              <div className="h-full bg-amber-300/70" style={{ width: `${((demo.step - 1) / demo.total) * 100}%` }} />
            ) : (
              <div className="h-full bg-cyan-300 origin-left" style={{ animation: `sx-grow ${demo.ms}ms linear both` }} />
            )}
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300">
              <span className={`w-1.5 h-1.5 ${paused ? "bg-amber-300" : "bg-rose-400 animate-pulse"}`} />
              <span className="truncate">
                {paused ? "Paused · " : ""}
                {demo.step}/{demo.total} · {demo.title}
              </span>
              <span className="ml-auto px-1.5 py-px border border-cyan-400/30 text-cyan-200/80 tracking-wider">
                {demo.audience === "expert" ? "Expert" : "Simple"}
              </span>
            </div>
            {!paused && <p className="mt-1.5 text-[15px] sm:text-[16px] leading-snug text-white sx-type">{demo.caption}</p>}
            {paused && (
              <p className="mt-1.5 text-[13px] leading-snug text-slate-300">
                Explore freely. Your place is saved: resume to continue from this shot.
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <div className="flex gap-1 flex-1 min-w-[80px]" aria-hidden="true">
                {Array.from({ length: demo.total }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 max-w-6 transition-colors duration-500 ${
                      i < demo.step - 1 ? "bg-cyan-300" : i === demo.step - 1 ? (paused ? "bg-amber-300" : "bg-cyan-300") : "bg-cyan-500/20"
                    }`}
                  />
                ))}
              </div>
              {paused ? (
                <button type="button" data-testid="demo-resume" onClick={onResume} className={`${btn} border-amber-300/70 text-amber-50 bg-amber-400/10`}>
                  <Play className="w-3 h-3" /> Resume
                </button>
              ) : (
                <button type="button" data-testid="demo-pause" onClick={onPause} className={btn}>
                  <Pause className="w-3 h-3" /> Pause
                </button>
              )}
              <button type="button" data-testid="demo-restart" onClick={onRestart} className={btn} aria-label="Restart tour from the beginning">
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Restart</span>
              </button>
              <button type="button" onClick={onToggleVoice} aria-pressed={demo.voice} className={btn}>
                {demo.voice ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                <span className="hidden sm:inline">{demo.voice ? "Voice on" : "Voice off"}</span>
              </button>
              <button type="button" data-testid="demo-close" onClick={onStop} className={btn} aria-label="Close tour (progress kept)">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1.5 text-[10px] font-mono text-slate-500">
              {paused ? "Space to resume · Esc to close (progress kept)" : "Tap the scene or press Space to pause · progress is saved"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
