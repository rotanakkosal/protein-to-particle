"use client";

import { useEffect, useRef } from "react";
import { MousePointerClick } from "lucide-react";
import { useExplorerStore } from "@/store/explorerStore";

/** Pointer-following tooltip describing whatever 3D component is under the cursor. */
export function HoverTooltip() {
  const hover = useExplorerStore((s) => s.hover);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = Math.min(window.innerWidth - w - 8, e.clientX + 16);
      const y = e.clientY + 18 + h > window.innerHeight - 8 ? e.clientY - h - 14 : e.clientY + 18;
      el.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div
      ref={ref}
      role="tooltip"
      className={`pointer-events-none fixed top-0 left-0 z-50 max-w-[300px] rounded-md border border-line bg-white/97 px-3 py-2 shadow-[0_4px_16px_rgba(7,38,90,0.14)] transition-opacity duration-150 ${
        hover ? "opacity-100" : "opacity-0"
      }`}
    >
      {hover && (
        <>
          <div className="flex items-center gap-2">
            {hover.swatch && <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: hover.swatch }} />}
            <span className="font-display text-[13.5px] leading-tight font-bold text-brand">{hover.title}</span>
          </div>
          {hover.subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{hover.subtitle}</p>}
          {hover.hint && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand">
              <MousePointerClick className="h-3 w-3" aria-hidden />
              {hover.hint}
            </p>
          )}
        </>
      )}
    </div>
  );
}
