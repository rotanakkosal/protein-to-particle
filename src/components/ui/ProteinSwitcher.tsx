"use client";

import { PROTEINS, PROTEIN_ORDER } from "@/content/proteins";
import { useExplorerStore } from "@/store/explorerStore";

/** Choose which protein to explore; switching starts the new protein at Level I. */
export function ProteinSwitcher({ className = "" }: { className?: string }) {
  const current = useExplorerStore((s) => s.selection.proteinId);
  const busy = useExplorerStore((s) => s.transition !== null);
  const setProtein = useExplorerStore((s) => s.setProtein);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[10px] font-bold tracking-[0.1em] text-muted uppercase">Protein</span>
      <div role="radiogroup" aria-label="Protein" className="flex rounded-[7px] border border-line bg-white p-0.5 shadow-[0_1px_3px_rgba(7,38,90,0.08)]">
        {PROTEIN_ORDER.map((id) => {
          const p = PROTEINS[id];
          const active = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => setProtein(id)}
              title={`${p.name} · PDB ${p.pdbId}`}
              className={`rounded-[5px] px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                active ? "bg-brand text-white" : "text-muted hover:bg-brand-soft hover:text-brand"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
