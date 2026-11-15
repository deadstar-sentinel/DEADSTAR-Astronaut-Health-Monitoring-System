import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronRight, X } from "lucide-react";
import { sfx } from "../utils/sound.ts";

export type ConsoleLineKind = "cmd" | "ok" | "info" | "warn" | "err";
export interface ConsoleLine {
  kind: ConsoleLineKind;
  text: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Runs a command and returns the lines to print. "CLEAR" is handled here. */
  onRun: (text: string) => ConsoleLine[];
  /** Short scope label, e.g. "NEURO-CRANIAL", from the current selection. */
  scope: string;
  /** One-click commands that fit the current selection. */
  chips: string[];
  accent: string;
}

const BOOT: ConsoleLine[] = [
  { kind: "info", text: "LIFELINE command console · type HELP, a command, or a plain question." },
  { kind: "info", text: "Example: SIMULATE CLOT --severity=3 · SCAN HEART · show me bone loss" },
];

const KIND_CLASS: Record<ConsoleLineKind, string> = {
  cmd: "text-white",
  ok: "text-emerald-300",
  info: "text-slate-300",
  warn: "text-amber-300",
  err: "text-rose-300",
};

export function CommandConsole({ open, onClose, onRun, scope, chips, accent }: Props) {
  const [lines, setLines] = useState<ConsoleLine[]>(BOOT);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  const run = (text: string) => {
    const t = text.trim();
    if (!t) return;
    sfx.key();
    setHistory((h) => [t, ...h.filter((x) => x !== t)].slice(0, 30));
    setCursor(-1);
    setValue("");
    if (/^(clear|cls)$/i.test(t)) {
      setLines([]);
      return;
    }
    const out = onRun(t);
    const echo: ConsoleLine = { kind: "cmd", text: t };
    setLines((l) => [...l, echo, ...out].slice(-160));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") run(value);
    else if (e.key === "Escape") onClose();
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(history.length - 1, cursor + 1);
      if (history[next] !== undefined) {
        setCursor(next);
        setValue(history[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = cursor - 1;
      setCursor(Math.max(-1, next));
      setValue(next >= 0 ? history[next] : "");
    }
  };

  if (!open) return null;

  return (
    <section
      data-testid="command-console"
      aria-label="LIFELINE command console"
      className="sx-rise absolute left-1/2 -translate-x-1/2 bottom-3 z-40 w-[min(760px,calc(100%-24px))] border bg-[#030812]/95 backdrop-blur-md shadow-[0_0_40px_rgba(0,0,0,0.6)]"
      style={{ borderColor: `${accent}66` }}
    >
      <div className="relative flex items-center gap-2 px-3 py-1.5 border-b overflow-hidden" style={{ borderColor: `${accent}33` }}>
        <span key={lines.length} className="sx-em-scan pointer-events-none absolute inset-y-0 left-0 w-1/3" style={{ background: `linear-gradient(90deg, transparent, ${accent}22, transparent)` }} />
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white">Console</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.12em]" style={{ color: accent }}>
          [{scope}]
        </span>
        <span className="ml-auto text-[9px] font-mono tracking-wider text-slate-500">KERNEL: SYNCED · ` TO TOGGLE</span>
        <button type="button" onClick={onClose} aria-label="Close console" className="p-0.5 text-slate-400 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={logRef} className="h-40 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed med-scroll" aria-live="polite">
        {lines.map((l, i) => (
          <div key={i} className={`${KIND_CLASS[l.kind]} whitespace-pre-wrap break-words sx-fade`}>
            {l.kind === "cmd" ? (
              <>
                <span style={{ color: accent }}>❯ </span>
                {l.text}
              </>
            ) : (
              l.text
            )}
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => run(c)}
              className="sx-press px-1.5 py-0.5 border text-[10px] font-mono text-slate-200 hover:text-white bg-white/[0.03]"
              style={{ borderColor: `${accent}55` }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 px-3 py-2 border-t" style={{ borderColor: `${accent}33` }}>
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: accent }} />
        <input
          id="lifeline-console-input"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          placeholder="SIMULATE HYPOXIA --severity=3   ·   or ask: what happens to bones in space?"
          className="flex-1 min-w-0 bg-transparent font-mono text-[12px] text-white placeholder:text-slate-600 focus:outline-none"
        />
      </div>
    </section>
  );
}
