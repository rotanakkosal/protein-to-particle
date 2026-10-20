"use client";

import { useEffect } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useTourStore } from "@/store/tourStore";
import { usePipelineStore } from "@/store/pipelineStore";

/** ← / → levels, Esc back, R reset, L labels, M mode, Space rotate, +/− zoom, / find, T tour, D theme. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useExplorerStore.getState();
      const tour = useTourStore.getState();
      // In the pipeline, ← / → / Esc step through the stages; search and tour belong to the explorer
      if (s.section === "make") {
        const p = usePipelineStore.getState();
        if (e.key === "ArrowRight") return p.next();
        if (e.key === "ArrowLeft" || e.key === "Escape") return p.previous();
        if (e.key === "/" || e.key === "t" || e.key === "T") return;
      }
      // While the tour runs, the arrow keys and Esc steer the tour instead of the levels
      if (tour.active && (e.key === "Escape" || e.key === "ArrowRight" || e.key === "ArrowLeft")) return;
      switch (e.key) {
        case "ArrowRight":
          s.next();
          break;
        case "ArrowLeft":
        case "Escape":
          if (s.searchOpen) s.setSearchOpen(false);
          else s.previous();
          break;
        case "/":
          e.preventDefault();
          s.setSearchOpen(true);
          break;
        case "t":
        case "T":
          if (tour.active) tour.stop();
          else tour.start();
          break;
        case "d":
        case "D":
          s.setTheme(s.theme === "dark" ? "light" : "dark");
          break;
        case "r":
        case "R":
          s.command("reset");
          break;
        case "l":
        case "L":
          s.toggleLabels();
          break;
        case "m":
        case "M":
          s.setMode(s.mode === "beginner" ? "scientific" : "beginner");
          break;
        case " ":
          if (t && (t.tagName === "BUTTON" || t.getAttribute("role") === "radio")) return;
          e.preventDefault();
          s.toggleAutoRotate();
          break;
        case "+":
        case "=":
          s.command("zoomIn");
          break;
        case "-":
        case "_":
          s.command("zoomOut");
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
