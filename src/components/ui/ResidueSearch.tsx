"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";
import { aminoAcid } from "@/content/aminoAcids";
import { hotspotsIn, PROTEINS } from "@/content/proteins";
import { aaLabel, type ProteinModel } from "@/lib/structure/protein";
import { useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";

interface Match {
  index: number;
  exact: boolean;
}

/**
 * Finds amino acids by position and/or name: "G12", "Gly12", "gly 12", "12", "lys", "glycine".
 * One letter + number uses the one-letter code; a lone letter lists every residue of that type.
 */
export function findResidues(protein: ProteinModel, query: string, limit = 8): { matches: Match[]; positionHint: number | null } {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^([a-z]*)(\d*)$/.exec(q);
  if (!q || !m) return { matches: [], positionHint: null };
  const [, name, num] = m;
  const nameOk = (resName: string, one: string) => {
    if (!name) return true;
    if (name.length === 1) return one.toLowerCase() === name;
    const three = resName.toLowerCase();
    return three.startsWith(name) || aminoAcid(resName).name.toLowerCase().startsWith(name);
  };
  const matches: Match[] = [];
  let positionHint: number | null = null;
  protein.residues.forEach((r, index) => {
    const seq = String(r.seq);
    const exact = num !== "" && seq === num;
    if (num !== "" && !seq.startsWith(num)) return;
    if (!nameOk(r.resName, r.one)) {
      if (exact) positionHint = index; // right position, different amino acid
      return;
    }
    matches.push({ index, exact });
  });
  matches.sort((a, b) => Number(b.exact) - Number(a.exact) || a.index - b.index);
  return { matches: matches.slice(0, limit), positionHint };
}

/** "Position 12 is Gly12 (glycine)": shown when the number exists but the letters name another amino acid. */
function PositionHint({ protein, index, onGo }: { protein: ProteinModel; index: number; onGo: (index: number) => void }) {
  const r = protein.residues[index];
  return (
    <p className="border-b border-line px-3 py-2 text-[11.5px] leading-snug text-muted">
      Position {r.seq} is{" "}
      <button type="button" onClick={() => onGo(index)} className="font-semibold text-brand-ink underline underline-offset-2">
        {aaLabel(r)}
      </button>{" "}
      ({aminoAcid(r.resName).name.toLowerCase()}).
    </p>
  );
}

/** "Find amino acid" popover: type a position or a name and jump straight to it at Level III. */
export function ResidueSearch() {
  const open = useExplorerStore((s) => s.searchOpen);
  const setOpen = useExplorerStore((s) => s.setSearchOpen);
  const busy = useExplorerStore((s) => s.transition !== null);
  const proteinId = useExplorerStore((s) => s.selection.proteinId);
  const jumpToResidue = useExplorerStore((s) => s.jumpToResidue);
  const protein = useDataStore((s) => s.protein);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    input.current?.select();
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, setOpen]);

  const result = useMemo(() => (protein ? findResidues(protein, query) : { matches: [], positionHint: null }), [protein, query]);
  const hot = useMemo(() => new Map(protein ? hotspotsIn(protein, proteinId).map((h) => [h.index, h.label]) : []), [protein, proteinId]);
  if (!protein) return null;
  const first = protein.residues[0];
  const last = protein.residues[protein.residues.length - 1];

  const go = (index: number) => {
    if (busy) return;
    jumpToResidue(index, protein.residues[index].regionId);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = result.matches.length;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      setActive((a) => (a + 1) % n);
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      setActive((a) => (a - 1 + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = result.matches[Math.min(active, n - 1)];
      if (pick) go(pick.index);
      else if (result.positionHint !== null) go(result.positionHint);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Find an amino acid (/)"
        className={`inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-[5px] border px-2 text-[11.5px] font-medium shadow-[0_1px_2px_rgba(7,38,90,0.06)] transition-colors hover:border-brand hover:text-brand-ink ${
          open ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface/95 text-ink"
        }`}
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Find</span>
        <span className="sr-only sm:hidden">Find an amino acid</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Find an amino acid"
          data-label-block
          className="fixed inset-x-3 top-[78px] z-40 overflow-hidden rounded-lg border border-line bg-surface text-left shadow-[0_8px_28px_rgba(7,38,90,0.18)] sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-[290px]"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="G12, Lys48, 61 or glycine"
              aria-label={`Amino acid in ${PROTEINS[proteinId].name}`}
              aria-controls="residue-results"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-muted hover:text-ink" aria-label="Close search">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {query.trim() === "" ? (
            <p className="px-3 py-2.5 text-[11.5px] leading-snug text-muted">
              {PROTEINS[proteinId].name} has amino acids {aaLabel(first)} to {aaLabel(last)}. Type a number, a name, or both.
            </p>
          ) : result.matches.length ? (
            <>
              {result.positionHint !== null && <PositionHint protein={protein} index={result.positionHint} onGo={go} />}
              <ul id="residue-results" role="listbox" className="max-h-[260px] overflow-y-auto py-1">
                {result.matches.map((mt, i) => {
                  const r = protein.residues[mt.index];
                  const region = protein.regionById[r.regionId]?.label.split(" · ")[0];
                  const spot = hot.get(mt.index);
                  return (
                    <li key={mt.index} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(mt.index)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${i === active ? "bg-brand-soft" : ""}`}
                      >
                        <span className="w-12 shrink-0 font-semibold text-ink">{aaLabel(r)}</span>
                        <span className="min-w-0 flex-1 truncate text-muted">
                          {aminoAcid(r.resName).name}
                          {region ? ` · ${region}` : ""}
                        </span>
                        {spot && <span className="rounded-full bg-hotspot px-1.5 text-[10px] leading-4 font-semibold text-white dark:text-paper">{spot}</span>}
                        {i === active && <CornerDownLeft className="h-3 w-3 shrink-0 text-faint" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : result.positionHint !== null ? (
            <PositionHint protein={protein} index={result.positionHint} onGo={go} />
          ) : (
            <p className="px-3 py-2.5 text-[11.5px] leading-snug text-muted">
              No match. {PROTEINS[proteinId].name} has amino acids {first.seq} to {last.seq}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
