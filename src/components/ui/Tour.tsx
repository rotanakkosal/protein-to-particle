"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { aminoAcid } from "@/content/aminoAcids";
import { levelSizes } from "@/content/levels";
import { PROTEINS } from "@/content/proteins";
import { dwellMs, TOUR_STEPS, type TourContext } from "@/content/tour";
import { ELEMENTS } from "@/lib/chem/elements";
import { aaLabel } from "@/lib/structure/protein";
import { getResidueMolecule, useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { useTourStore } from "@/store/tourStore";

const PROTON_FM = 1.7;
/** Time for the fold/unfold and orbit/cloud animations to finish before a caption starts counting */
const SETTLE_MS = { unfold: 2000, atomView: 900 };

function useTourContext(): TourContext | null {
  const protein = useDataStore((s) => s.protein);
  const selection = useExplorerStore((s) => s.selection);
  return useMemo(() => {
    if (!protein || selection.residueIndex < 0) return null;
    const entry = PROTEINS[selection.proteinId];
    const residue = protein.residues[selection.residueIndex];
    const molecule = getResidueMolecule(protein, selection.residueIndex);
    const atom = molecule.atomById[selection.atomId] ?? molecule.atomById.CA;
    const el = ELEMENTS[atom.element];
    const widthM = (protein.maxDimension / 10) * 1e-9;
    return {
      proteinName: entry.name,
      residueCount: protein.residues.length,
      residueLabel: aaLabel(residue),
      residueName: aminoAcid(residue.resName).name.toLowerCase(),
      residueNote: entry.residueNote(residue.seq, residue.resName)?.beginner ?? null,
      atomName: el.name.toLowerCase(),
      atomDisplay: atom.display,
      protons: el.Z,
      neutrons: el.massNumber - el.Z,
      sizes: levelSizes(protein, molecule, selection, entry.name),
      zoomFactor: widthM / (PROTON_FM * 1e-15),
      perHair: Math.floor(50e-6 / widthM / 1000) * 1000,
    };
  }, [protein, selection]);
}

/**
 * Guided tour: zooms through the five levels on its own with a caption at each stop.
 * Each step names a level and view; the controller steers the explorer there, waits for the
 * transition to finish, then counts down the caption. Any manual navigation ends the tour.
 */
export function Tour() {
  const active = useTourStore((s) => s.active);
  const step = useTourStore((s) => s.step);
  const paused = useTourStore((s) => s.paused);
  const progress = useTourStore((s) => s.progress);
  const { goTo, stop, start, setPaused } = useTourStore.getState();
  const ctx = useTourContext();
  const run = useRef({ requested: false, arrived: false, settleUntil: 0, elapsed: 0, last: 0, proteinId: "" });

  const def = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const text = ctx ? def.text(ctx) : "";
  // The interval below reads the current caption length through this ref
  const dwell = useRef(dwellMs(""));
  useEffect(() => {
    dwell.current = dwellMs(text);
  }, [text]);

  // Start of each step: reset the step bookkeeping; the very first step also resets the explorer
  useEffect(() => {
    if (!active) return;
    const r = run.current;
    r.requested = false;
    r.arrived = false;
    r.settleUntil = 0;
    r.elapsed = 0;
    r.last = performance.now();
    const st = useExplorerStore.getState();
    useExplorerStore.setState({ searchOpen: false, hover: null });
    if (step === 0) {
      r.proteinId = st.selection.proteinId;
      useExplorerStore.setState({ chainUnfolded: false, atomView: "orbits", aminoAcidForm: "residue", showHotspots: false, autoRotate: true });
      if (!st.transition) st.restart();
      r.requested = true;
    }
  }, [active, step]);

  // The step machine: navigate, apply the view, let it settle, then count down the caption
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const r = run.current;
      const now = performance.now();
      const dt = now - r.last;
      r.last = now;
      const st = useExplorerStore.getState();
      const tour = useTourStore.getState();
      const d = TOUR_STEPS[tour.step];
      if (st.selection.proteinId !== r.proteinId && r.proteinId) {
        tour.stop(); // the user switched protein
        return;
      }
      if (st.transition) return;
      if (st.level !== d.level) {
        if (r.arrived) {
          tour.stop(); // the user navigated somewhere else
          return;
        }
        if (!r.requested) {
          r.requested = true;
          st.goToLevel(d.level);
        }
        return;
      }
      if (!r.arrived) {
        if (d.level === 1 && st.chainUnfolded !== d.view.chainUnfolded) {
          st.setChainUnfolded(d.view.chainUnfolded);
          r.settleUntil = now + SETTLE_MS.unfold;
        }
        if (d.level === 3 && st.atomView !== d.view.atomView) {
          st.setAtomView(d.view.atomView);
          r.settleUntil = now + SETTLE_MS.atomView;
        }
        r.arrived = true;
        return;
      }
      if (now < r.settleUntil || tour.paused || tour.step === TOUR_STEPS.length - 1) return;
      r.elapsed += dt;
      tour.setProgress(Math.min(1, r.elapsed / dwell.current));
      if (r.elapsed >= dwell.current) tour.goTo(tour.step + 1);
    }, 100);
    return () => window.clearInterval(id);
  }, [active]);

  // Keyboard: ← / → step, Esc ends the tour
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const tour = useTourStore.getState();
      if (e.key === "Escape") tour.stop();
      else if (e.key === "ArrowRight" && tour.step < TOUR_STEPS.length - 1) tour.goTo(tour.step + 1);
      else if (e.key === "ArrowLeft" && tour.step > 0) tour.goTo(tour.step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <AnimatePresence>
      {active && ctx && (
        <motion.div
          key="tour"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3 }}
          data-label-block
          role="region"
          aria-label="Guided tour"
          className="pointer-events-auto w-[min(520px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface/97 shadow-[0_6px_24px_rgba(7,38,90,0.16)]"
        >
          <div className="h-[3px] bg-paper-2">
            <div className="h-full bg-brand transition-[width] duration-100 ease-linear" style={{ width: `${(last ? 1 : progress) * 100}%` }} />
          </div>
          <div className="px-4 pt-2.5 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.1em] text-brand-mid uppercase">
                Guided tour · {step + 1} / {TOUR_STEPS.length}
              </span>
              <span className="flex gap-1" aria-hidden>
                {TOUR_STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-brand" : i < step ? "bg-brand/40" : "bg-line"}`} />
                ))}
              </span>
              <button type="button" onClick={stop} className="ml-auto rounded p-0.5 text-muted hover:text-ink" aria-label="End the tour (Esc)" title="End the tour (Esc)">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}>
                <h3 className="mt-1 font-display text-[15.5px] leading-snug font-extrabold text-brand-ink">{def.title(ctx)}</h3>
                <p className="mt-1 text-[12.5px] leading-[1.55] text-body" aria-live="polite">
                  {text}
                </p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-2.5 flex items-center gap-1.5">
              {last ? (
                <>
                  <button type="button" onClick={start} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-medium text-ink hover:border-brand hover:text-brand-ink">
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    Watch again
                  </button>
                  <button type="button" onClick={stop} className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand px-3.5 py-1 text-[11.5px] font-medium text-white hover:bg-brand-dark">
                    Explore on my own
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => goTo(step - 1)}
                    disabled={step === 0}
                    className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink hover:border-brand hover:text-brand-ink disabled:opacity-35"
                    title="Previous step (←)"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaused(!paused)}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink hover:border-brand hover:text-brand-ink"
                    aria-pressed={paused}
                  >
                    {paused ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(step + 1)}
                    className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-brand px-3 py-1 text-[11.5px] font-medium text-white hover:bg-brand-dark"
                    title="Next step (→)"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
