"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { ELEMENTS } from "@/lib/chem/elements";
import { LEVELS } from "@/content/levels";
import { getResidueMolecule, useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { useShallow } from "zustand/react/shallow";
import { aaLabel } from "@/lib/structure/protein";

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string; s?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-line bg-white/95 p-0.5 text-[11.5px] font-medium shadow-[0_1px_3px_rgba(7,38,90,0.08)]">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-2.5 py-1 whitespace-nowrap transition-colors sm:px-3 ${value === o.v ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
        >
          <span className={o.s ? "hidden sm:inline" : undefined}>{o.l}</span>
          {o.s && <span className="sm:hidden">{o.s}</span>}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`rounded-full border px-3 py-1 text-[11.5px] font-medium whitespace-nowrap shadow-[0_1px_3px_rgba(7,38,90,0.08)] transition-colors ${
        on ? "border-brand bg-brand text-white" : "border-line bg-white/95 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Level-specific view options (fold/unfold, residue/free, orbits/cloud, quarks, field). */
export function ContextControls() {
  const s = useExplorerStore(
    useShallow((st) => ({
      level: st.transition ? null : st.level,
      colorScheme: st.colorScheme,
      setColorScheme: st.setColorScheme,
      chainUnfolded: st.chainUnfolded,
      setChainUnfolded: st.setChainUnfolded,
      aminoAcidForm: st.aminoAcidForm,
      setAminoAcidForm: st.setAminoAcidForm,
      atomView: st.atomView,
      setAtomView: st.setAtomView,
      showQuarks: st.showQuarks,
      setShowQuarks: st.setShowQuarks,
      showField: st.showField,
      setShowField: st.setShowField,
    })),
  );
  const level = s.level;
  if (level === 0)
    return (
      <Segmented
        label="Colour scheme"
        value={s.colorScheme}
        onChange={s.setColorScheme}
        options={[
          { v: "structure", l: "Colour by structure", s: "Structure" },
          { v: "rainbow", l: "Colour by chain order", s: "N→C order" },
        ]}
      />
    );
  if (level === 1)
    return (
      <Segmented
        label="Chain layout"
        value={s.chainUnfolded ? "unfolded" : "folded"}
        onChange={(v) => s.setChainUnfolded(v === "unfolded")}
        options={[
          { v: "folded", l: "Folded" },
          { v: "unfolded", l: "Unfold chain", s: "Unfold" },
        ]}
      />
    );
  if (level === 2)
    return (
      <Segmented
        label="Amino-acid form"
        value={s.aminoAcidForm}
        onChange={s.setAminoAcidForm}
        options={[
          { v: "residue", l: "In the protein", s: "In chain" },
          { v: "free", l: "Free amino acid", s: "Free" },
        ]}
      />
    );
  if (level === 3)
    return (
      <Segmented
        label="Atom model"
        value={s.atomView}
        onChange={s.setAtomView}
        options={[
          { v: "orbits", l: "Orbit model (simplified)", s: "Orbits" },
          { v: "cloud", l: "Electron cloud", s: "Cloud" },
        ]}
      />
    );
  if (level === 4)
    return (
      <div className="flex gap-1.5">
        <Toggle on={s.showQuarks} onChange={s.setShowQuarks}>
          <span className="hidden sm:inline">Quarks inside</span>
          <span className="sm:hidden">Quarks</span>
        </Toggle>
        <Toggle on={s.showField} onChange={s.setShowField}>
          <span className="hidden sm:inline">Charge field</span>
          <span className="sm:hidden">Field</span>
        </Toggle>
      </div>
    );
  return null;
}

const stepBase =
  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap shadow-[0_1px_3px_rgba(7,38,90,0.08)] transition-colors disabled:opacity-35";

/** "Back to …": returns to the parent level. */
export function PrevButton() {
  const level = useExplorerStore((s) => s.level);
  const busy = useExplorerStore((s) => s.transition !== null);
  const previous = useExplorerStore((s) => s.previous);
  const label = level > 0 ? `Back to ${LEVELS[level - 1].name.toLowerCase()}` : null;
  return (
    <button type="button" onClick={previous} disabled={!label || busy} className={`${stepBase} border-line bg-white/95 text-ink hover:border-brand hover:text-brand`} title="Previous level (←)">
      <ChevronLeft className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label ?? "Previous level"}</span>
      <span className="sm:hidden">Back</span>
    </button>
  );
}

/** "Zoom into …": descends into the currently selected component. */
export function NextButton() {
  const protein = useDataStore((s) => s.protein);
  const level = useExplorerStore((s) => s.level);
  const busy = useExplorerStore((s) => s.transition !== null);
  const selection = useExplorerStore((s) => s.selection);
  const next = useExplorerStore((s) => s.next);
  if (!protein) return null;
  const m = getResidueMolecule(protein, selection.residueIndex);
  const atom = m.atomById[selection.atomId];
  const label = [
    "Zoom into the chain",
    `Zoom into ${aaLabel(protein.residues[selection.residueIndex])}`,
    `Zoom into the ${atom ? atom.display : ELEMENTS[selection.atomElement].name} atom`,
    `Zoom into a ${selection.particle}`,
    null,
  ][level];
  return (
    <button type="button" onClick={next} disabled={!label || busy} className={`${stepBase} border-brand bg-brand text-white hover:bg-brand-dark`} title="Next level (→)">
      <span className="hidden sm:inline">{label ?? "Deepest level reached"}</span>
      <span className="sm:hidden">{label ? "Zoom in" : "End"}</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}
