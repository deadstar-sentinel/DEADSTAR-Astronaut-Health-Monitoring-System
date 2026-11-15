import { Play, X } from "lucide-react";
import { QrPanel } from "../sentinel/MissionBar.tsx";

/** Shown when the guided tour finishes on its own: invite judges to join on their phones. */
export function TourEndCard({ onReplay, onClose }: { onReplay: () => void; onClose: () => void }) {
  return (
    <div data-testid="tour-end-card" className="sx-fade fixed inset-0 z-[72] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="sx-pop w-[min(560px,100%)] border border-cyan-300/50 bg-[#030a16]/95 shadow-[0_0_60px_rgba(0,229,255,0.2)] p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Join the crew"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Tour complete · your turn</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Join the crew from your phone</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-4">
          <QrPanel />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReplay}
            className="px-3 py-2 border border-cyan-300 bg-cyan-500/15 text-[11px] font-mono uppercase tracking-wider text-cyan-50 hover:bg-cyan-500/25 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> Replay tour
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 border border-cyan-500/30 text-[11px] font-mono uppercase tracking-wider text-slate-200 hover:text-white"
          >
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
