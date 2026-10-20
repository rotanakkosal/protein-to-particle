"use client";

import { AA_CLASS_INFO, aminoAcid, type AminoAcidClass } from "@/content/aminoAcids";
import { ELEMENTS, type ElementSymbol } from "@/lib/chem/elements";
import type { ProteinModel } from "@/lib/structure/protein";
import { aaLabel } from "@/lib/structure/protein";
import type { ResidueMolecule } from "@/lib/chem/residueMolecule";
import { useExplorerStore } from "@/store/explorerStore";
import { PARTICLE_COLORS, SS_COLORS } from "@/scene/shared/palette";
import { hotspotsIn } from "@/content/proteins";
import { ChevronRight } from "lucide-react";

const Dot = ({ color, ring = false }: { color: string; ring?: boolean }) => (
  <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ring ? "ring-1 ring-black/15" : ""}`} style={{ background: color }} />
);

export function StructureLegend() {
  const scheme = useExplorerStore((s) => s.colorScheme);
  if (scheme === "rainbow") {
    return (
      <div className="mt-3">
        <div className="h-2 rounded-full" style={{ background: "linear-gradient(90deg,#3b5bd6,#3bb6d6,#4fcf6a,#e5d046,#e3823b,#d6433b)" }} />
        <div className="mt-1 flex justify-between text-[10.5px] text-muted">
          <span>N-terminus (start, Met1)</span>
          <span>C-terminus (end, Gly76)</span>
        </div>
      </div>
    );
  }
  const items = [
    { c: SS_COLORS.helix, l: "α-helix (spiral)" },
    { c: SS_COLORS.strand, l: "β-strand (arrow)" },
    { c: SS_COLORS.helix310, l: "3₁₀-helix" },
    { c: SS_COLORS.coil, l: "loop / turn" },
  ];
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
      {items.map((i) => (
        <li key={i.l} className="flex items-center gap-1.5">
          <Dot color={i.c} />
          {i.l}
        </li>
      ))}
    </ul>
  );
}

/** Disease hotspots (KRAS G12, G13, Q61): what each change does, with a shortcut to zoom into it. */
export function HotspotList({ protein }: { protein: ProteinModel }) {
  const proteinId = useExplorerStore((s) => s.selection.proteinId);
  const show = useExplorerStore((s) => s.showHotspots);
  const mode = useExplorerStore((s) => s.mode);
  const busy = useExplorerStore((s) => s.transition !== null);
  const jumpToResidue = useExplorerStore((s) => s.jumpToResidue);
  const hotspots = show ? hotspotsIn(protein, proteinId) : [];
  if (!hotspots.length) return null;
  return (
    <section className="mt-3 rounded-md border border-hotspot/35 bg-hotspot/[0.06] px-2.5 py-2" aria-label="Cancer hotspots">
      <h3 className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.08em] text-hotspot uppercase">
        <span className="h-2 w-2 rounded-full bg-hotspot" aria-hidden />
        Cancer hotspots
      </h3>
      <ul className="mt-1.5 space-y-1.5">
        {hotspots.map((h) => {
          const r = protein.residues[h.index];
          return (
            <li key={h.label}>
              <button
                type="button"
                disabled={busy}
                onClick={() => jumpToResidue(h.index, r.regionId)}
                className="group w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-surface/70"
                title={`Zoom into ${aaLabel(r)}`}
              >
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                  {h.label}
                  <span className="font-normal text-muted">· {aaLabel(r)}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-hotspot" aria-hidden />
                </span>
                <span className="block text-[11.5px] leading-snug text-body">{mode === "beginner" ? h.note.beginner : h.note.scientific}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SequenceStrip({ protein }: { protein: ProteinModel }) {
  const selected = useExplorerStore((s) => s.selection.residueIndex);
  const proteinId = useExplorerStore((s) => s.selection.proteinId);
  const showHotspots = useExplorerStore((s) => s.showHotspots);
  const hot = new Set(showHotspots ? hotspotsIn(protein, proteinId).map((h) => h.index) : []);
  const hovered = useExplorerStore((s) => s.hoveredResidue);
  const select = useExplorerStore((s) => s.select);
  const command = useExplorerStore((s) => s.command);
  const setHoveredResidue = useExplorerStore((s) => s.setHoveredResidue);
  const busy = useExplorerStore((s) => s.transition !== null);
  const classes = Object.entries(AA_CLASS_INFO) as [AminoAcidClass, (typeof AA_CLASS_INFO)[AminoAcidClass]][];

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-[10.5px] tracking-wide text-muted uppercase">
        <span>Sequence · N → C</span>
        <span className="normal-case">tap a letter to select</span>
      </div>
      <div
        className={`grid gap-[2px] font-mono ${protein.residues.length > 100 ? "grid-cols-[repeat(20,minmax(0,1fr))] text-[9.5px]" : "grid-cols-[repeat(19,minmax(0,1fr))] text-[10.5px]"}`}
        role="listbox"
        aria-label="Amino-acid sequence"
      >
        {protein.residues.map((r, i) => {
          const cls = aminoAcid(r.resName).cls;
          const isSel = i === selected;
          const isHov = i === hovered;
          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={isSel}
              disabled={busy}
              title={`${aaLabel(r)} · ${aminoAcid(r.resName).name}`}
              onMouseEnter={() => setHoveredResidue(i)}
              onMouseLeave={() => setHoveredResidue(null)}
              onClick={() => {
                select({ residueIndex: i, regionId: r.regionId });
                command("refocus");
              }}
              className={`flex aspect-square items-center justify-center rounded-[3px] leading-none transition-transform ${
                isSel ? "z-10 scale-110 font-bold text-white ring-2 ring-brand" : isHov ? "scale-110 text-ink ring-1 ring-ink/40" : "text-ink/85"
              } ${hot.has(i) ? "outline-2 outline-offset-1 outline-hotspot" : ""}`}
              style={{ background: isSel ? "var(--color-brand)" : `${AA_CLASS_INFO[cls].color}${isHov ? "" : "55"}` }}
            >
              {r.one}
            </button>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
        {classes.map(([k, v]) => (
          <li key={k} className="flex items-center gap-1">
            <Dot color={v.color} />
            {v.beginner}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AtomLegend({ molecule, form }: { molecule: ResidueMolecule; form: "residue" | "free" }) {
  const counts = new Map<ElementSymbol, number>();
  for (const a of molecule.atoms) {
    if (a.context || !(form === "free" ? a.inFree : a.inResidue)) continue;
    counts.set(a.element, (counts.get(a.element) ?? 0) + 1);
  }
  const order: ElementSymbol[] = ["C", "H", "N", "O", "S"];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      {order
        .filter((e) => counts.has(e))
        .map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <Dot color={ELEMENTS[e].color} ring={e === "H"} />
            <span>
              {ELEMENTS[e].name} <span className="text-faint">×{counts.get(e)}</span>
            </span>
          </li>
        ))}
      {form === "residue" && (molecule.prevLabel || molecule.nextLabel) && (
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-3 rounded-full bg-[#C99A2E]" />
          peptide bond
        </li>
      )}
    </ul>
  );
}

export function ParticleCounts({ symbol }: { symbol: ElementSymbol }) {
  const el = ELEMENTS[symbol];
  const rows: { c: string; n: number; l: string }[] = [
    { c: PARTICLE_COLORS.proton, n: el.Z, l: "protons (+)" },
    { c: PARTICLE_COLORS.neutron, n: el.massNumber - el.Z, l: "neutrons (0)" },
    { c: PARTICLE_COLORS.electron, n: el.Z, l: "electrons (−)" },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {rows.map((r) => (
        <div key={r.l} className="rounded-md bg-paper-2 px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[16px] font-semibold text-ink tabular-nums">
            <Dot color={r.c} />
            {r.n}
          </div>
          <div className="text-[10.5px] text-muted">{r.l}</div>
        </div>
      ))}
    </div>
  );
}

export function MassChart() {
  const selected = useExplorerStore((s) => s.selection.particle);
  const select = useExplorerStore((s) => s.select);
  const rows = [
    { k: "proton" as const, l: "Proton", m: 1836.15, q: "+1" },
    { k: "neutron" as const, l: "Neutron", m: 1838.68, q: "0" },
    { k: "electron" as const, l: "Electron", m: 1, q: "−1" },
  ];
  return (
    <div className="mt-3 space-y-1.5">
      <div className="text-[10.5px] tracking-wide text-muted uppercase">Mass (electron = 1) · charge</div>
      {rows.map((r) => (
        <button
          key={r.k}
          type="button"
          onClick={() => select({ particle: r.k })}
          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] transition-colors ${selected === r.k ? "bg-brand-soft" : "hover:bg-paper-2"}`}
        >
          <span className="w-14 shrink-0 font-medium text-ink">{r.l}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0.6, (r.m / 1838.68) * 100)}%`, background: PARTICLE_COLORS[r.k] }} />
          </span>
          <span className="w-11 shrink-0 text-right text-muted tabular-nums">{r.m >= 10 ? Math.round(r.m).toLocaleString("en-US") : r.m}</span>
          <span className="w-6 shrink-0 text-right font-semibold text-ink">{r.q}</span>
        </button>
      ))}
    </div>
  );
}
