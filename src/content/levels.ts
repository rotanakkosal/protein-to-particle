import type { Level, Selection } from "@/store/explorerStore";
import { ELEMENTS } from "@/lib/chem/elements";
import { aaLabel, type ProteinModel } from "@/lib/structure/protein";
import type { ResidueMolecule } from "@/lib/chem/residueMolecule";

export interface LevelMeta {
  id: Level;
  numeral: string;
  name: string;
  /** Real-world size of one scene unit, or null for schematic (not-to-scale) levels */
  metersPerUnit: number | null;
  /** Shown instead of a scale bar on schematic levels */
  schematicNote?: string;
}

export const LEVELS: LevelMeta[] = [
  { id: 0, numeral: "I", name: "Protein", metersPerUnit: 1e-10 },
  { id: 1, numeral: "II", name: "Polypeptide Chain", metersPerUnit: 1e-10 },
  { id: 2, numeral: "III", name: "Amino Acid", metersPerUnit: 1e-10 },
  { id: 3, numeral: "IV", name: "Atom", metersPerUnit: null, schematicNote: "Schematic · not to scale" },
  { id: 4, numeral: "V", name: "Subatomic Particles", metersPerUnit: null, schematicNote: "Schematic · ~10⁻¹⁵ m" },
];

/* ------------------------------------------------------------------ real sizes */


export interface LevelSize {
  /** Short caption next to the level, e.g. "4.5 nm" */
  short: string;
  /** Full sentence for tooltips and screen readers */
  long: string;
}

/** Hydrogen's van der Waals radius (nm): the outer edge of a molecule is almost always a hydrogen */
const H_VDW_NM = 0.12;
const nm = (x: number, digits = 1) => `${x.toFixed(digits)} nm`;

/**
 * The real size of what each level shows, measured from the loaded structure where possible:
 * protein extent, stretched chain length, the selected amino acid, the selected atom
 * (covalent diameter, as in the Level IV text) and the selected particle.
 */
export function levelSizes(protein: ProteinModel, molecule: ResidueMolecule, selection: Selection, proteinName: string): LevelSize[] {
  const across = protein.maxDimension / 10;

  let contour = 0;
  for (let i = 1; i < protein.residues.length; i++) {
    const r = protein.residues[i];
    if (!r.breakBefore) contour += r.atoms.CA.distanceTo(protein.residues[i - 1].atoms.CA) / 10;
  }

  const own = molecule.atoms.filter((a) => !a.context && a.inResidue);
  let span = 0;
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) span = Math.max(span, own[i].position.distanceTo(own[j].position));
  const residueSize = span / 10 + 2 * H_VDW_NM;
  const residueName = aaLabel(protein.residues[selection.residueIndex]);

  const el = ELEMENTS[selection.atomElement];
  const atomSize = (2 * el.covalentRadiusPm) / 1000;

  const particle =
    selection.particle === "electron"
      ? { short: "point-like", long: "An electron has no measurable size: as far as experiments can tell, it is a point." }
      : {
          short: "1.7 fm",
          long: `A ${selection.particle} is about 1.7 femtometres across (1 fm is a millionth of a nanometre).`,
        };

  return [
    { short: nm(across), long: `${proteinName} is about ${nm(across)} across.` },
    { short: `${Math.round(contour)} nm long`, long: `Stretched out, the chain of ${protein.residues.length} amino acids would be about ${Math.round(contour)} nm long.` },
    { short: nm(residueSize), long: `${residueName} is about ${nm(residueSize)} across.` },
    { short: nm(atomSize, 2), long: `A ${el.name.toLowerCase()} atom is about ${nm(atomSize, 2)} across (twice its covalent radius).` },
    particle,
  ];
}
