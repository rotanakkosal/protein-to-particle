"use client";

import { LEVELS, levelSizes } from "@/content/levels";
import { PROTEINS } from "@/content/proteins";
import { getResidueMolecule, useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";

/**
 * Right-hand vertical hierarchy navigation (roman numerals, as in the reference), with the real
 * size of what each level shows so the zoom reads as a journey down the powers of ten.
 */
export function LevelNav() {
  const level = useExplorerStore((s) => s.level);
  const target = useExplorerStore((s) => s.transition?.to ?? null);
  const goToLevel = useExplorerStore((s) => s.goToLevel);
  const selection = useExplorerStore((s) => s.selection);
  const protein = useDataStore((s) => s.protein);
  const active = target ?? level;
  const sizes = protein ? levelSizes(protein, getResidueMolecule(protein, selection.residueIndex), selection, PROTEINS[selection.proteinId].name) : null;

  return (
    <nav aria-label="Structural levels" className="relative">
      <div className="absolute top-3 right-[13px] bottom-3 w-px bg-line sm:right-[14px]" aria-hidden />
      <ol className="relative flex flex-col gap-2.5 sm:gap-3">
        {LEVELS.map((l) => {
          const isActive = l.id === active;
          const size = sizes?.[l.id];
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => goToLevel(l.id)}
                disabled={target !== null}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Level ${l.numeral}: ${l.name}${size ? `. ${size.long}` : ""}`}
                title={size?.long}
                className="group flex items-center justify-end gap-2.5"
              >
                <span className="hidden flex-col items-end text-right leading-tight md:flex">
                  <span
                    className={`hidden text-[11px] tracking-wide transition-colors xl:block ${
                      isActive ? "font-semibold text-brand-ink" : "text-muted group-hover:text-ink"
                    }`}
                  >
                    {l.name}
                  </span>
                  {size && (
                    <span className={`text-[10px] whitespace-nowrap tabular-nums transition-colors ${isActive ? "font-medium text-brand-mid" : "text-faint group-hover:text-muted"}`}>
                      {size.short}
                    </span>
                  )}
                </span>
                <span
                  className={`flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border font-display text-[10.5px] font-bold transition-all duration-300 sm:h-[29px] sm:w-[29px] ${
                    isActive
                      ? "scale-105 border-brand bg-brand text-white shadow-[0_2px_8px_rgba(7,38,90,0.3)]"
                      : "border-faint bg-paper text-ink group-hover:border-brand group-hover:text-brand-ink"
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
