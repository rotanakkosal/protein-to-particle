"use client";

import { useEffect } from "react";
import { useExplorerStore } from "@/store/explorerStore";

/** ← / → levels, Esc back, R reset, L labels, M mode, Space rotate, +/− zoom. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useExplorerStore.getState();
      switch (e.key) {
        case "ArrowRight":
          s.next();
          break;
        case "ArrowLeft":
        case "Escape":
          s.previous();
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
