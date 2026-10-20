"use client";

import { ChevronRight } from "lucide-react";
import { pathLabels } from "@/content/info";
import { getResidueMolecule, useDataStore } from "@/store/dataStore";
import { useExplorerStore, type Level } from "@/store/explorerStore";

/** Where you are in the hierarchy; every step back up is one click away. */
export function Breadcrumb() {
  const protein = useDataStore((s) => s.protein);
  const level = useExplorerStore((s) => s.level);
  const target = useExplorerStore((s) => s.transition?.to ?? null);
  const selection = useExplorerStore((s) => s.selection);
  const goToLevel = useExplorerStore((s) => s.goToLevel);
  const current = target ?? level;
  // At Level I the path is just the protein name, which the protein switcher already shows
  if (!protein || current === 0) return null;
  const labels = pathLabels(protein, getResidueMolecule(protein, selection.residueIndex), selection);

  return (
    <nav aria-label="Location in the hierarchy" className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-0.5 gap-y-1 text-[11.5px]">
      {labels.slice(0, current + 1).map((label, i) => {
        const active = i === current;
        return (
          <span key={i} className="flex items-center">
            {i > 0 && <ChevronRight className="mx-0.5 h-3 w-3 text-faint" aria-hidden />}
            <button
              type="button"
              disabled={active || target !== null}
              onClick={() => goToLevel(i as Level)}
              className={`rounded px-1 py-0.5 transition-colors ${
                active ? "font-semibold text-ink" : "text-muted underline-offset-2 hover:bg-surface/70 hover:text-brand-ink hover:underline"
              }`}
              aria-current={active ? "location" : undefined}
            >
              {label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
