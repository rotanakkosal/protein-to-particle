"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Hand, Waypoints, X } from "lucide-react";
import { useExplorerStore, type Level } from "@/store/explorerStore";
import { useTourStore } from "@/store/tourStore";

const HINTS: Record<Level, string> = {
  0: "Drag to rotate · scroll to zoom · click any coloured part of the protein to zoom in",
  1: "Each bead is one amino acid. Click a bead (or a letter in the sequence) to look inside it",
  2: "Click a carbon atom (grey) to zoom into it · try “Free amino acid” below",
  3: "Click a proton, neutron or electron to see what it is",
  4: "Click a particle to compare it · toggle quarks and the charge field below",
};

/** Subtle first-time hints, one per level, dismissed on interaction or after a few seconds. */
export function Hints() {
  const level = useExplorerStore((s) => s.level);
  const busy = useExplorerStore((s) => s.transition !== null);
  const touring = useTourStore((s) => s.active);
  const startTour = useTourStore((s) => s.start);
  const [seen, setSeen] = useState<Set<Level>>(() => new Set());
  const [visible, setVisible] = useState<Level | null>(null);

  useEffect(() => {
    if (busy || touring || seen.has(level)) return;
    const show = setTimeout(() => setVisible(level), 500);
    const hide = setTimeout(() => {
      setVisible((v) => (v === level ? null : v));
      setSeen((s) => new Set(s).add(level));
    }, 9500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [level, busy, touring, seen]);

  const dismiss = () => {
    setVisible(null);
    setSeen((s) => new Set(s).add(level));
  };

  return (
    <AnimatePresence>
      {!busy && !touring && visible !== null && visible === level && (
        <motion.div
          key={visible}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.3 }}
          data-label-block
          className="pointer-events-auto flex max-w-[min(640px,calc(100vw-2rem))] items-center gap-2 rounded-[18px] border border-line bg-surface/95 py-1.5 pr-1.5 pl-3 text-[12px] text-ink shadow-[0_2px_10px_rgba(7,38,90,0.1)]"
          role="status"
        >
          <Hand className="h-3.5 w-3.5 shrink-0 text-brand-ink" aria-hidden />
          <span>{HINTS[visible]}</span>
          {visible === 0 && (
            <button
              type="button"
              onClick={() => {
                dismiss();
                startTour();
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-white hover:bg-brand-dark"
            >
              <Waypoints className="h-3 w-3" aria-hidden />
              Take the tour
            </button>
          )}
          <button type="button" onClick={dismiss} className="rounded-full p-1 text-muted hover:bg-paper hover:text-ink" aria-label="Dismiss hint">
            <X className="h-3 w-3" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
