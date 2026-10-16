"use client";

import { Home, Minus, Pause, Play, Plus, RotateCcw, Tag } from "lucide-react";
import { useExplorerStore } from "@/store/explorerStore";

const btn =
  "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-[5px] border border-line bg-white/95 px-1.5 text-[11.5px] font-medium text-ink shadow-[0_1px_2px_rgba(7,38,90,0.06)] transition-colors hover:border-brand hover:text-brand disabled:opacity-40";

/** Top-right controls: zoom, reset, rotate, labels and the explanation mode. */
export function ViewControls() {
  const command = useExplorerStore((s) => s.command);
  const autoRotate = useExplorerStore((s) => s.autoRotate);
  const toggleAutoRotate = useExplorerStore((s) => s.toggleAutoRotate);
  const showLabels = useExplorerStore((s) => s.showLabels);
  const toggleLabels = useExplorerStore((s) => s.toggleLabels);
  const mode = useExplorerStore((s) => s.mode);
  const setMode = useExplorerStore((s) => s.setMode);
  const busy = useExplorerStore((s) => s.transition !== null);
  const restart = useExplorerStore((s) => s.restart);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        <button type="button" className={btn} onClick={() => command("zoomIn")} disabled={busy} aria-label="Zoom in" title="Zoom in (+)">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => command("zoomOut")} disabled={busy} aria-label="Zoom out" title="Zoom out (−)">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={`${btn} px-2`} onClick={() => command("reset")} disabled={busy} title="Reset view (R)">
          <RotateCcw className="h-3 w-3 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Reset</span>
          <span className="sr-only sm:hidden">Reset view</span>
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${btn} px-2`} onClick={restart} disabled={busy} title="Start over from the complete protein">
          <Home className="h-3 w-3" />
          <span className="hidden sm:inline">Start over</span>
          <span className="sr-only sm:hidden">Start over</span>
        </button>
        <button type="button" className={`${btn} px-2`} onClick={toggleAutoRotate} aria-pressed={autoRotate} title="Auto-rotate (Space)">
          {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          <span className="hidden sm:inline">Rotate</span>
        </button>
        <button
          type="button"
          className={`${btn} px-2 ${showLabels ? "!border-brand/60 !text-brand" : ""}`}
          onClick={toggleLabels}
          aria-pressed={showLabels}
          title="Show / hide labels (L)"
        >
          <Tag className="h-3 w-3" />
          <span className="hidden sm:inline">Labels</span>
        </button>
      </div>
      <div role="radiogroup" aria-label="Explanation level" className="flex rounded-[6px] border border-line bg-white/95 p-0.5 text-[11px] font-medium shadow-[0_1px_2px_rgba(7,38,90,0.06)]">
        {(["beginner", "scientific"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-[4px] px-2 py-1 capitalize transition-colors ${mode === m ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
            title="Switch explanation mode (M)"
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
