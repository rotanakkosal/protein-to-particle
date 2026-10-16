"use client";

import { LEVELS } from "@/content/levels";
import { useExplorerStore } from "@/store/explorerStore";

/** Right-hand vertical hierarchy navigation (roman numerals, as in the reference). */
export function LevelNav() {
  const level = useExplorerStore((s) => s.level);
  const target = useExplorerStore((s) => s.transition?.to ?? null);
  const goToLevel = useExplorerStore((s) => s.goToLevel);
  const active = target ?? level;

  return (
    <nav aria-label="Structural levels" className="relative">
      <div className="absolute top-3 right-[13px] bottom-3 w-px bg-line sm:right-[14px]" aria-hidden />
      <ol className="relative flex flex-col gap-2.5 sm:gap-3">
        {LEVELS.map((l) => {
          const isActive = l.id === active;
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => goToLevel(l.id)}
                disabled={target !== null}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Level ${l.numeral}: ${l.name}`}
                className="group flex items-center justify-end gap-2.5"
              >
                <span
                  className={`hidden text-right text-[11px] leading-tight tracking-wide transition-all xl:block ${
                    isActive ? "font-semibold text-brand" : "text-muted opacity-70 group-hover:text-ink group-hover:opacity-100"
                  }`}
                >
                  {l.name}
                </span>
                <span
                  className={`flex h-[27px] w-[27px] items-center justify-center rounded-full border font-display text-[10.5px] font-bold transition-all duration-300 sm:h-[29px] sm:w-[29px] ${
                    isActive
                      ? "scale-105 border-brand bg-brand text-white shadow-[0_2px_8px_rgba(7,38,90,0.3)]"
                      : "border-[#9aa5b8] bg-paper text-ink group-hover:border-brand group-hover:text-brand"
                  }`}
                >
                  {l.numeral}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
