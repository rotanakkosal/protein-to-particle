"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Home, Link2, Minus, Moon, Pause, Play, Plus, RotateCcw, Sun, Tag, Waypoints } from "lucide-react";
import { useExplorerStore } from "@/store/explorerStore";
import { useDataStore } from "@/store/dataStore";
import { useTourStore } from "@/store/tourStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { currentViewUrl } from "@/store/urlState";
import { ResidueSearch } from "./ResidueSearch";

const btn =
  "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-[5px] border border-line bg-surface/95 px-1.5 text-[11.5px] font-medium text-ink shadow-[0_1px_2px_rgba(7,38,90,0.06)] transition-colors hover:border-brand hover:text-brand-ink disabled:opacity-40";

/** Inside another page (an iframe) the address bar is not ours, so a copied link would not open this view. */
const noop = () => () => {};
function useEmbedded() {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    },
    () => false,
  );
}

/** Copies a link to the current view; falls back to a selectable field where the clipboard is blocked. */
function ShareButton() {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === "copied") {
      const t = setTimeout(() => setState("idle"), 1800);
      return () => clearTimeout(t);
    }
    if (state === "manual") field.current?.select();
  }, [state]);

  const share = async () => {
    const link = currentViewUrl(useDataStore.getState().protein, { forSharing: true });
    setUrl(link);
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("manual");
    }
  };

  return (
    <div className="relative">
      <button type="button" className={`${btn} px-2`} onClick={share} title="Copy a link to this exact view">
        {state === "copied" ? <Check className="h-3 w-3" aria-hidden /> : <Link2 className="h-3 w-3" aria-hidden />}
        <span className="hidden sm:inline">{state === "copied" ? "Copied" : "Share"}</span>
        <span className="sr-only sm:hidden">{state === "copied" ? "Link copied" : "Copy link to this view"}</span>
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Link copied to the clipboard" : ""}
      </span>
      {state === "manual" && (
        <div data-label-block className="fixed inset-x-3 top-[140px] z-40 rounded-lg border border-line bg-surface p-2.5 shadow-[0_8px_28px_rgba(7,38,90,0.18)] sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-[300px]">
          <p className="mb-1.5 text-[11px] text-muted">Copy this link to share the current view:</p>
          <input ref={field} readOnly value={url} onFocus={(e) => e.target.select()} className="w-full rounded border border-line bg-paper px-2 py-1 text-[11.5px] text-ink" aria-label="Link to this view" />
          <button type="button" onClick={() => setState("idle")} className="mt-1.5 text-[11px] font-medium text-brand-ink hover:underline">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Top-right controls: find, zoom, reset, tour, rotate, labels, share, theme and the explanation mode.
 * In the pipeline ("make") the search and tour are left out and Start over returns to stage 1.
 */
export function ViewControls({ variant = "explore" }: { variant?: "explore" | "make" }) {
  const make = variant === "make";
  const pipelineBusy = usePipelineStore((s) => s.transition !== null);
  const command = useExplorerStore((s) => s.command);
  const autoRotate = useExplorerStore((s) => s.autoRotate);
  const toggleAutoRotate = useExplorerStore((s) => s.toggleAutoRotate);
  const showLabels = useExplorerStore((s) => s.showLabels);
  const toggleLabels = useExplorerStore((s) => s.toggleLabels);
  const mode = useExplorerStore((s) => s.mode);
  const setMode = useExplorerStore((s) => s.setMode);
  const busy = useExplorerStore((s) => s.transition !== null) || pipelineBusy;
  const restart = useExplorerStore((s) => s.restart);
  const theme = useExplorerStore((s) => s.theme);
  const setTheme = useExplorerStore((s) => s.setTheme);
  const touring = useTourStore((s) => s.active);
  const startTour = useTourStore((s) => s.start);
  const stopTour = useTourStore((s) => s.stop);
  const embedded = useEmbedded();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        {!make && <ResidueSearch />}
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
        {!make && (
        <button
          type="button"
          className={`${btn} px-2 ${touring ? "!border-brand !bg-brand !text-white" : ""}`}
          onClick={touring ? stopTour : startTour}
          aria-pressed={touring}
          title={touring ? "Stop the guided tour" : "Guided tour: zoom through all five levels (T)"}
        >
          <Waypoints className="h-3 w-3" aria-hidden />
          <span className="hidden sm:inline">{touring ? "Stop tour" : "Tour"}</span>
          <span className="sr-only sm:hidden">{touring ? "Stop the guided tour" : "Start the guided tour"}</span>
        </button>
        )}
        <button
          type="button"
          className={`${btn} px-2`}
          onClick={make ? () => usePipelineStore.getState().goTo(0) : restart}
          disabled={busy}
          title={make ? "Back to stage 1, the gene" : "Start over from the complete protein"}
        >
          <Home className="h-3 w-3" />
          <span className="hidden sm:inline">Start over</span>
          <span className="sr-only sm:hidden">Start over</span>
        </button>
        <button type="button" className={`${btn} px-2`} onClick={toggleAutoRotate} aria-pressed={autoRotate} title="Auto-rotate (Space)">
          {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          <span className="hidden sm:inline">Rotate</span>
          <span className="sr-only sm:hidden">Auto-rotate</span>
        </button>
        <button
          type="button"
          className={`${btn} px-2 ${showLabels ? "!border-brand/60 !text-brand-ink" : ""}`}
          onClick={toggleLabels}
          aria-pressed={showLabels}
          title="Show / hide labels (L)"
        >
          <Tag className="h-3 w-3" />
          <span className="hidden sm:inline">Labels</span>
          <span className="sr-only sm:hidden">Labels</span>
        </button>
      </div>
      <div className="flex items-center gap-1">
        {!embedded && <ShareButton />}
        <button
          type="button"
          className={btn}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme (D)" : "Dark theme (D)"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <div role="radiogroup" aria-label="Explanation level" className="flex rounded-[6px] border border-line bg-surface/95 p-0.5 text-[11px] font-medium shadow-[0_1px_2px_rgba(7,38,90,0.06)]">
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
    </div>
  );
}
