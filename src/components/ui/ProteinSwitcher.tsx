"use client";

import { PROTEINS, PROTEIN_ORDER } from "@/content/proteins";
import { useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";

/** Choose which protein to explore; switching starts the new protein at Level I. */
export function ProteinSwitcher({ className = "" }: { className?: string }) {
  const current = useExplorerStore((s) => s.selection.proteinId);
  const busy = useExplorerStore((s) => s.transition !== null);
  const setProtein = useExplorerStore((s) => s.setProtein);
  const loaded = useDataStore((s) => s.loaded);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[10px] font-bold tracking-[0.1em] text-muted uppercase">Protein</span>
      <div role="radiogroup" aria-label="Protein" className="flex rounded-[7px] border border-line bg-surface p-0.5 shadow-[0_1px_3px_rgba(7,38,90,0.08)]">
        {PROTEIN_ORDER.map((id) => {
          const p = PROTEINS[id];
          const active = id === current;
          const count = loaded[id]?.protein.residues.length ?? p.residueCount;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => setProtein(id)}
              title={`${p.name} · ${count} amino acids · PDB ${p.pdbId}`}
              className={`flex items-baseline gap-1.5 rounded-[5px] px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                active ? "bg-brand text-white" : "text-muted hover:bg-brand-soft hover:text-brand-ink"
              }`}
            >
              {p.name}
              <span className={`hidden text-[10.5px] font-medium tabular-nums sm:inline ${active ? "text-white/90" : "text-faint"}`}>{count} aa</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
